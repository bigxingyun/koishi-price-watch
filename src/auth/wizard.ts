import { h, type Context } from 'koishi'

import type { Config } from '../index'
import { closeLoginWindow } from '../crawler/browser'
import * as repo from '../store/repo'
import {
  confirmLogin,
  getAuthState,
  requestLogin,
  setAuthState,
  skipLogin,
  verifyLogin,
} from './login'
import type { Session, StepResult } from './state'
import { LOGIN_ORDER as ORDER, REFRESH_MS as REFRESH } from './state'

export type { Session, StepResult }

/**
 * 登录状态机（唯一一套）。
 *
 * 之前是「向导 + 单平台观察者」两套状态机各自改同一批 meta，互相抢推进，
 * 结果就是：登录拼多多，状态却显示淘宝在等待。
 *
 * 现在只有一套：
 *   session = { queue, current, results, deadline, refreshedAt, origin }
 *   状态转移只有 4 个入口：tick（自动）/ confirm / skip / cancel
 *   所有写入都可能被 tick 与命令同时触发，所以用 busy 串行化
 *
 * 不变量（改代码必须守住）：
 *   1. current 永远等于「还没出结论的第一个平台」
 *   2. 只有 advance() 能改 current 和写 results
 *   3. 超时只判一次，判完立刻 advance
 *   4. 自动检测只认行为验证（verifyLogin），不做 cookie 猜测
 */

export const LOGIN_ORDER = ORDER

export interface LoginOrigin {
  platform: string
  channelId: string
  selfId?: string
}


const KEY = 'login:session'
const PLATFORM_ZH: Record<string, string> = { pdd: '拼多多', jd: '京东', taobao: '淘宝' }
const RESULT_TEXT: Record<StepResult, string> = { ok: '已登录', skipped: '已跳过', failed: '未能登录' }
const REFRESH_MS = 45_000

export interface AdvanceReply {
  text: string
  qr?: Buffer
  /** 整页截图（各平台都发） */
  fullPage?: Buffer
  done: boolean
}


// ── 纯逻辑转出（实现见 state.ts） ───────────────────

export { afterAdvance, decide } from './state'
export type { StepAction, StepEvent } from './state'

// ── 读写 ────────────────────────────────────────

export async function getSession(ctx: Context): Promise<Session | null> {
  const raw = await repo.metaGet(ctx, KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as Session
    if (!session.current || !Array.isArray(session.queue)) return null
    return session
  } catch {
    return null
  }
}

async function save(ctx: Context, session: Session | null): Promise<void> {
  if (!session) {
    await repo.metaDel(ctx, KEY).catch(() => undefined)
    return
  }
  await repo.metaSet(ctx, KEY, JSON.stringify(session)).catch(() => undefined)
}

// ── 单一 tick ───────────────────────────────────

let busy = false
const timers = new WeakMap<Context, ReturnType<typeof setInterval>>()

function ensureTick(ctx: Context, config: Config): void {
  if (timers.has(ctx)) return
  const timer = setInterval(() => {
    void tick(ctx, config)
  }, 2500)
  timer.unref?.()
  timers.set(ctx, timer)
  ctx.effect(() => () => {
    stopTick(ctx)
    return () => undefined
  })
}

function stopTick(ctx: Context): void {
  const timer = timers.get(ctx)
  if (timer) clearInterval(timer)
  timers.delete(ctx)
}

export function isTicking(ctx: Context): boolean {
  return timers.has(ctx)
}

async function tick(ctx: Context, config: Config): Promise<void> {
  if (busy) return
  busy = true
  try {
    const session = await getSession(ctx)
    if (!session) {
      stopTick(ctx)
      return
    }

    if (session.deadline > 0 && Date.now() > session.deadline) {
      const reply = await advance(ctx, config, session, 'skipped', '超时未操作')
      await deliver(ctx, session.origin, reply.text)
      return
    }

    const check = await verifyLogin(ctx, config, session.current).catch(() => null)
    if (check?.loggedIn) {
      const reply = await advance(ctx, config, session, 'ok', check.detail)
      await deliver(ctx, session.origin, reply.text)
      if (reply.qr) await deliverImage(ctx, session.origin, reply.qr)
      return
    }

    if (Date.now() - session.refreshedAt > REFRESH_MS) {
      const ticket = await requestLogin(ctx, config, session.current, { origin: session.origin }).catch(() => null)
      if (ticket?.ok && ticket.qr) {
        session.refreshedAt = Date.now()
        await save(ctx, session)
        await deliver(ctx, session.origin, '二维码已刷新（旧码会失效），请扫这一张：')
        await deliverImage(ctx, session.origin, ticket.qr)
      if (ticket.fullPage) await deliverImage(ctx, session.origin, ticket.fullPage)
      }
    }
  } finally {
    busy = false
  }
}

// ── 唯一的状态转移 ──────────────────────────────

async function advance(
  ctx: Context,
  config: Config,
  session: Session,
  result: StepResult,
  detail = '',
): Promise<AdvanceReply> {
  const platform = session.current
  session.results[platform] = result

  if (result === 'ok') {
    await setAuthState(ctx, platform, 'ok')
    // 登录成功 = 之前的「需要登录」失败已解除，顺手解封并清掉计数
    const { unblock } = await import('../crawler/guard')
    await unblock(ctx, platform).catch(() => undefined)
    await repo.metaDel(ctx, `authFail:${platform}`).catch(() => undefined)
    // 保留窗口 = 采集复用同一个浏览器实例（指纹与页面内会话都不变）
    if (!config.collect.keepLoginWindow) await closeLoginWindow(ctx, platform).catch(() => undefined)
  } else if (result === 'skipped') {
    await setAuthState(ctx, platform, 'expired')
    await skipLogin(ctx, platform).catch(() => undefined)
  } else {
    await setAuthState(ctx, platform, 'failed')
    await closeLoginWindow(ctx, platform).catch(() => undefined)
  }

  const head = `${PLATFORM_ZH[platform] ?? platform}：${RESULT_TEXT[result]}${detail ? `（${detail}）` : ''}`

  if (!session.queue.length) {
    await save(ctx, null)
    stopTick(ctx)
    return { text: `${head}\n\n${summary(session)}`, done: true }
  }

  session.current = session.queue.shift()!
  const timeout = Math.max(30, config.advanced.loginStepTimeout) * 1000
  session.deadline = Date.now() + timeout
  session.refreshedAt = Date.now()

  const ticket = await requestLogin(ctx, config, session.current, { origin: session.origin }).catch(() => null)
  if (!ticket?.ok) {
    session.results[session.current] = 'failed'
    const failed = session.current
    await save(ctx, session)
    if (!session.queue.length) {
      stopTick(ctx)
      await save(ctx, null)
      return {
        text: `${head}\n\n${PLATFORM_ZH[failed] ?? failed}：无法打开登录页（${ticket?.message?.split('\n')[0] ?? '未知'}）\n\n${summary(session)}`,
        done: true,
      }
    }
    session.current = session.queue.shift()!
    await save(ctx, session)
    return {
      text: `${head}\n\n${PLATFORM_ZH[failed] ?? failed}：无法打开登录页，已跳到 ${PLATFORM_ZH[session.current] ?? session.current}`,
      done: false,
    }
  }

  await save(ctx, session)
  return { text: `${head}\n\n${stepText(session, ticket.message, timeout)}`, qr: ticket.qr, fullPage: ticket.fullPage, done: false }
}

function stepText(session: Session, message: string, timeoutMs: number): string {
  // 单平台登录要显示 1/1，而不是 1/3
  const total = Object.keys(session.results).length + session.queue.length + 1
  const index = Object.keys(session.results).length + 1
  const zh = PLATFORM_ZH[session.current] ?? session.current
  // 标题只保留「第几步 + 平台 + 方式」，不再拼接内部说明（那会把实现细节漏给用户）
  return [
    `【登录 ${index}/${total}】${zh}　扫码登录`,
    '',
    message,
    '',
    `扫完不用发确认，我会自动检测；二维码 45 秒自动换新，超时 ${Math.round(timeoutMs / 1000)} 秒自动跳过。`,
  ].join('\n')
}

function summary(session: Session): string {
  const lines = ['登录流程结束：']
  for (const platform of LOGIN_ORDER) {
    const result = session.results[platform]
    if (!result) continue
    lines.push(`  ${PLATFORM_ZH[platform] ?? platform}：${RESULT_TEXT[result]}`)
  }
  const ok = LOGIN_ORDER.filter((p) => session.results[p] === 'ok')
  lines.push('')
  lines.push(ok.length
    ? `可以开始采集了：价格 管理 采集 -p ${ok[0]}`
    : '没有平台登录成功。可以重发「价格 管理 登录」再试。')
  return lines.join('\n')
}

// ── 命令入口 ────────────────────────────────────

export async function startWizard(ctx: Context, config: Config, origin?: LoginOrigin): Promise<AdvanceReply> {
  if (!config.collect.browserEnabled) {
    return { text: '浏览器采集没开，无法登录。请到配置「采集 → 用真实浏览器抓」打开。', done: false }
  }
  const existing = await getSession(ctx)
  if (existing) {
    return {
      text: `已经有一轮登录在进行（当前 ${PLATFORM_ZH[existing.current] ?? existing.current}）。\n要重来请先发「价格 管理 登录 取消」。`,
      done: false,
    }
  }
  // 先实测三家登录态：已经登录的不该再让用户扫一遍
  const pending: string[] = []
  const already: string[] = []
  for (const platform of LOGIN_ORDER) {
    const check = await verifyLogin(ctx, config, platform).catch(() => null)
    if (check?.loggedIn) already.push(platform)
    else pending.push(platform)
  }
  if (!pending.length) {
    return {
      text: `三家都已登录，不需要再扫码：\n${already.map((p) => `  ${PLATFORM_ZH[p] ?? p}：已登录，跳过`).join('\n')}`,
      done: true,
    }
  }
  const prefix = already.length
    ? `已登录，跳过：${already.map((p) => PLATFORM_ZH[p] ?? p).join('、')}\n\n`
    : ''
  const reply = await startPlatforms(ctx, config, pending, origin)
  return prefix ? { ...reply, text: prefix + reply.text } : reply
}

/** 只登一个平台：先清掉旧的一轮，避免两套流程打架 */
export async function startSingle(
  ctx: Context,
  config: Config,
  platform: string,
  origin?: LoginOrigin,
): Promise<AdvanceReply> {
  if (!config.collect.browserEnabled) return { text: '浏览器采集没开，无法登录。', done: false }
  await loginCancel(ctx)
  return startPlatforms(ctx, config, [platform], origin)
}

async function startPlatforms(
  ctx: Context,
  config: Config,
  platforms: string[],
  origin?: LoginOrigin,
): Promise<AdvanceReply> {
  const [first, ...rest] = platforms
  const timeout = Math.max(30, config.advanced.loginStepTimeout) * 1000
  const session: Session = {
    queue: rest,
    current: first,
    results: {},
    deadline: Date.now() + timeout,
    refreshedAt: Date.now(),
    startedAt: Date.now(),
    origin,
  }

  const ticket = await requestLogin(ctx, config, first, { origin })
  if (!ticket.ok) {
    session.results[first] = 'failed'
    if (!session.queue.length) {
      await save(ctx, null)
      return { text: `${PLATFORM_ZH[first] ?? first}：无法打开登录页（${ticket.message.split('\n')[0]}）`, done: true }
    }
    session.current = session.queue.shift()!
    const retry = await requestLogin(ctx, config, session.current, { origin })
    await save(ctx, session)
    ensureTick(ctx, config)
    return {
      text: `${PLATFORM_ZH[first] ?? first} 打不开登录页，已跳到 ${PLATFORM_ZH[session.current] ?? session.current}\n\n${retry.message}`,
      qr: retry.qr,
  fullPage: retry.fullPage,
      done: false,
    }
  }

  await save(ctx, session)
  ensureTick(ctx, config)
  return { text: stepText(session, ticket.message, timeout), qr: ticket.qr, fullPage: ticket.fullPage, done: false }
}

export async function advanceWizard(
  ctx: Context,
  config: Config,
  action: 'ok' | 'skip',
): Promise<AdvanceReply> {
  if (busy) return { text: '正在处理上一步，稍等一下再发。', done: false }
  const session = await getSession(ctx)
  if (!session) return { text: '当前没有进行中的登录。发「价格 管理 登录」开始。', done: true }
  return advance(ctx, config, session, action === 'ok' ? 'ok' : 'skipped', '手动')
}

export async function wizardStatus(ctx: Context, config: Config): Promise<string> {
  const session = await getSession(ctx)
  if (!session) {
    return '当前没有进行中的登录。\n发「价格 管理 登录」——拼多多 → 京东 → 淘宝 依次给二维码，扫完自动跳下一步。'
  }
  const lines = ['登录进度：']
  for (const platform of LOGIN_ORDER) {
    const result = session.results[platform]
    const marker = result ? '✔' : platform === session.current ? '▶' : '·'
    const text = result ? RESULT_TEXT[result] : platform === session.current ? '等待中' : '未开始'
    lines.push(`  ${marker} ${PLATFORM_ZH[platform] ?? platform}：${text}`)
  }
  const left = Math.max(0, Math.round((session.deadline - Date.now()) / 1000))
  lines.push('')
  lines.push(`当前：${PLATFORM_ZH[session.current] ?? session.current}，剩余 ${left} 秒`)
  lines.push(isTicking(ctx) ? '自动检测：运行中（每 2.5 秒一次）' : '自动检测：未运行（发一次「价格 管理 登录」会重启）')
  if (left <= 0) lines.push('已超时，下一轮检测会跳过它。')
  return lines.join('\n')
}

export async function loginCancel(ctx: Context): Promise<string> {
  const session = await getSession(ctx)
  stopTick(ctx)
  await save(ctx, null)
  if (!session) return '当前没有进行中的登录。'
  const ok = LOGIN_ORDER.filter((p) => session.results[p] === 'ok')
  return ok.length
    ? `已取消登录流程。已登录并保留：${ok.map((p) => PLATFORM_ZH[p] ?? p).join('、')}`
    : '已取消登录流程。'
}

export const cancelWizard = loginCancel
export const getWizard = getSession

/** 启动时恢复：状态在库、定时器在内存，重启后必须接上 */
export async function resumeWizard(ctx: Context, config: Config): Promise<void> {
  const session = await getSession(ctx)
  if (!session) return
  ensureTick(ctx, config)
  if (session.deadline > 0 && Date.now() > session.deadline) {
    const timeout = Math.max(30, config.advanced.loginStepTimeout) * 1000
    session.deadline = Date.now() + timeout
    session.refreshedAt = 0
    await save(ctx, session)
  }
}

// ── 推送 ────────────────────────────────────────

function botOf(ctx: Context, origin?: LoginOrigin) {
  if (!origin) return undefined
  return ctx.bots.find((b) => b.platform === origin.platform)
}

async function deliver(ctx: Context, origin: LoginOrigin | undefined, text: string): Promise<void> {
  const bot = botOf(ctx, origin)
  if (!bot || !origin?.channelId) return
  await bot.sendMessage(origin.channelId, text).catch(() => undefined)
}

async function deliverImage(ctx: Context, origin: LoginOrigin | undefined, qr: Buffer): Promise<void> {
  const bot = botOf(ctx, origin)
  if (!bot || !origin?.channelId) return
  await bot.sendMessage(origin.channelId, h.image(qr, 'image/png').toString()).catch(() => undefined)
}

export { confirmLogin, getAuthState }