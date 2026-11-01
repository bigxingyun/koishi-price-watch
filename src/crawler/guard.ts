import { Context } from 'koishi'

import { toDay } from '../constants'
import * as repo from '../store/repo'

/**
 * 采集守卫：日请求硬闸 + 平台熔断 + 冷却。
 *
 * 状态全部落在 pw_meta，**重启不丢** —— 这是「重启后不要立刻又去打一遍平台」的前提。
 */

interface GuardCount {
  count: number
}

interface BlockState {
  until: number
  reason: string
}

const countKey = (platform: string, day: number) => `guard:${platform}:${day}`
const blockKey = (platform: string) => `block:${platform}`

export async function getCount(ctx: Context, platform: string, day = toDay()): Promise<number> {
  const raw = await repo.metaGet(ctx, countKey(platform, day))
  if (!raw) return 0
  try {
    return (JSON.parse(raw) as GuardCount).count ?? 0
  } catch {
    return 0
  }
}

/** 记一次请求，返回累计次数 */
export async function incrCount(ctx: Context, platform: string, day = toDay()): Promise<number> {
  const next = (await getCount(ctx, platform, day)) + 1
  await repo.metaSet(ctx, countKey(platform, day), JSON.stringify({ count: next }))
  return next
}

export interface BlockInfo {
  blocked: boolean
  until?: Date
  reason?: string
}

export async function isBlocked(ctx: Context, platform: string): Promise<BlockInfo> {
  const raw = await repo.metaGet(ctx, blockKey(platform))
  if (!raw) return { blocked: false }
  try {
    const state = JSON.parse(raw) as BlockState
    if (state.until > Date.now()) return { blocked: true, until: new Date(state.until), reason: state.reason }
    // 过期了顺手清掉
    await repo.metaDel(ctx, blockKey(platform))
    return { blocked: false }
  } catch {
    return { blocked: false }
  }
}

/** 熔断：检测到验证码/登录失效/403 时调用 */
export async function blockPlatform(ctx: Context, platform: string, hours: number, reason: string): Promise<void> {
  const state: BlockState = { until: Date.now() + hours * 3600_000, reason }
  await repo.metaSet(ctx, blockKey(platform), JSON.stringify(state))
}

export async function unblock(ctx: Context, platform: string): Promise<void> {
  await repo.metaDel(ctx, blockKey(platform))
}

export interface GuardDecision {
  ok: boolean
  reason?: string
}

/** 采集前的总闸检查 */
export async function checkGuard(
  ctx: Context,
  platform: string,
  dailyCap: number,
  day = toDay(),
): Promise<GuardDecision> {
  const block = await isBlocked(ctx, platform)
  if (block.blocked) {
    return { ok: false, reason: `${platform} 冷却中（至 ${block.until?.toLocaleString()}，原因：${block.reason}）` }
  }
  const count = await getCount(ctx, platform, day)
  if (count >= dailyCap) {
    return { ok: false, reason: `${platform} 已达当日请求上限 ${dailyCap} 次` }
  }
  return { ok: true }
}
