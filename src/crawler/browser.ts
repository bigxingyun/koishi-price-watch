import { Context } from 'koishi'

import type { Config } from '../index'

/**
 * 浏览器池。
 *
 * 两种用法，对应两种完全不同的需求：
 *
 * 1. `getRenderPool` —— 图片渲染。不需要 cookie，用普通 launch，快、无状态。
 * 2. `withProfile` / `openProfile` —— 采集与登录。**必须用持久化 profile**，
 *    否则登录成功后 cookie 随浏览器关闭一起消失，登录等于白做（这是之前的致命 bug）。
 *
 * 每个平台一个独立 profile 目录：京东/淘宝/拼多多的 cookie 混在一起会互相踩。
 */

export interface PageLike {
  setContent(html: string, options?: Record<string, unknown>): Promise<void>
  evaluate<T = unknown>(fn: string | ((...args: never[]) => T), arg?: unknown): Promise<T>
  setViewportSize(size: { width: number; height: number }): Promise<void>
  screenshot(options?: Record<string, unknown>): Promise<Buffer>
  close(): Promise<void>
  goto?(url: string, options?: Record<string, unknown>): Promise<unknown>
  waitForSelector?(selector: string, options?: Record<string, unknown>): Promise<unknown>
  textContent?(selector: string): Promise<string | null>
  content?(): Promise<string>
}

export interface CookieLike {
  name: string
  value: string
  domain: string
  httpOnly?: boolean
}

export interface BrowserLike {
  newPage(options?: Record<string, unknown>): Promise<PageLike>
  /** 浏览器级 cookie 读取：**能看到 HttpOnly**，document.cookie 看不到（京东 pt_key 就是 HttpOnly） */
  cookies?(urls?: string | string[]): Promise<CookieLike[]>
  close(): Promise<void>
}

const IDLE_CLOSE_MS = 5 * 60 * 1000
const CONTEXT_IDLE_MS = 2 * 60 * 1000

/** 系统 Chrome 的常见位置 */
function detectChrome(): string | undefined {
  const fs = require('node:fs')
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : []
  for (const path of candidates) {
    try {
      if (fs.existsSync(path)) return path
    } catch { /* ignore */ }
  }
  return undefined
}

function loadPlaywright(): {
  chromium: {
    launch(options: Record<string, unknown>): Promise<BrowserLike>
    launchPersistentContext(dir: string, options: Record<string, unknown>): Promise<BrowserLike>
  }
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('playwright-core')
  } catch {
    throw new Error(
      '需要 playwright-core（可选依赖）：npm i playwright-core，或在配置里关闭浏览器与图片',
    )
  }
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36'

function launchArgs(config: Config) {
  return {
    // playwright 只认 boolean：无头时用有头启动 + --headless=new，
    // 新版 headless 的行为和有头一致，被识别概率远低于旧无头模式。
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // 关掉自动化特征：开源项目里最有效的一步（少了它 100% 被识别）
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--lang=zh-CN,zh',
      '--window-size=1280,900',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--mute-audio',
      ...(config.collect.browserHeadless ? ['--headless=new'] : []),
    ],
    ...(config.collect.browserPath || detectChrome()
      ? { executablePath: config.collect.browserPath || detectChrome() }
      : {}),
  }
}

// ── 渲染用：普通 launch，不需要 cookie ──────────────

class RenderPool {
  private browser?: BrowserLike
  private launching?: Promise<BrowserLike>
  private leases = 0
  private timer?: ReturnType<typeof setTimeout>
  private closed = false

  constructor(private config: Config) {}

  async acquire(): Promise<BrowserLike> {
    if (this.closed) throw new Error('浏览器池已关闭')
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.leases++
    if (this.browser) return this.browser
    if (!this.launching) {
      const { chromium } = loadPlaywright()
      this.launching = chromium.launch(launchArgs(this.config))
        .then((browser) => (this.browser = browser))
        .finally(() => { this.launching = undefined })
    }
    return this.launching
  }

  release(): void {
    this.leases = Math.max(0, this.leases - 1)
    if (this.leases > 0 || this.closed) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.close() }, IDLE_CLOSE_MS)
    this.timer.unref?.()
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    const browser = this.browser
    this.browser = undefined
    if (browser) await browser.close().catch(() => undefined)
  }
}

const renderPools = new WeakMap<Context, RenderPool>()

export function getRenderPool(ctx: Context, config: Config): RenderPool {
  let pool = renderPools.get(ctx)
  if (!pool) {
    pool = new RenderPool(config)
    renderPools.set(ctx, pool)
    ctx.effect(() => () => {
      renderPools.delete(ctx)
      return pool!.close()
    })
  }
  return pool
}

/** 渲染一张图：拿到页面 → 用完自动关 */
export async function withRenderPage<T>(
  ctx: Context,
  config: Config,
  fn: (page: PageLike) => Promise<T>,
): Promise<T> {
  const pool = getRenderPool(ctx, config)
  const browser = await pool.acquire()
  let page: PageLike | undefined
  try {
    page = await browser.newPage({
      viewport: { width: config.basic.imageWidth, height: 900 },
      deviceScaleFactor: config.basic.imageScale,
    })
    return await fn(page)
  } finally {
    if (page) await page.close().catch(() => undefined)
    pool.release()
  }
}

// ── 采集/登录用：持久化 profile ────────────────────

export function profileDirOf(config: Config, platform: string): string {
  const root = config.collect.profileDir || 'data/price-watch/profiles'
  return require('node:path').join(root, platform)
}

export interface ProfileSession {
  browser: BrowserLike
  close: () => Promise<void>
}

/**
 * 打开某平台的持久化 profile。
 *
 * @param forceHeaded 需要人工操作时（例如拼多多手机号登录）强制显示窗口
 */
export async function openProfile(
  config: Config,
  platform: string,
  options: { forceHeaded?: boolean; viewport?: { width: number; height: number } } = {},
): Promise<ProfileSession> {
  const fs = require('node:fs')
  const dir = profileDirOf(config, platform)
  fs.mkdirSync(dir, { recursive: true })

  const { chromium } = loadPlaywright()
  const base = launchArgs(config)
  let browser: BrowserLike
  try {
    browser = await chromium.launchPersistentContext(dir, {
      ...base,
      headless: options.forceHeaded ? false : base.headless,
      // 视口必须在 context 级设置：BrowserContext.newPage() 不接受 viewport 参数
      viewport: options.viewport ?? { width: 420, height: 780 },
      // context 级 UA：playwright 注册的 UA 会覆盖启动参数，这里才是最终值
      userAgent: DESKTOP_UA,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    })
    await applyStealth(browser)
  } catch (error) {
    const message = (error as Error).message ?? ''
    // 同一个 userDataDir 只能有一个 Chrome 实例，否则直接退出（exitCode=21）
    if (/user data directory is already in use|ProcessSingleton|exitCode=21|has been closed/i.test(message)) {
      throw new Error(
        `${platform} 的登录窗口还占着 profile 目录。请先关掉那个浏览器窗口，或发「价格 管理 登录 取消」后再试。`,
      )
    }
    throw error
  }
  // 注入脚本抹掉最明显的自动化痕迹（navigator.webdriver / 空插件表 / 缺失 chrome 对象）
  try {
    const context = browser as unknown as { addInitScript?: (script: string) => Promise<void> }
    await context.addInitScript?.(`(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      if (!window.chrome) window.chrome = { runtime: {} }
    })()`)
  } catch { /* 注入失败不影响主流程 */ }
  return { browser, close: () => browser.close().catch(() => undefined) }
}

/** 用一次持久化 profile 跑一段逻辑，结束后关闭（cookie 已落盘） */
export async function withProfile<T>(
  config: Config,
  platform: string,
  fn: (browser: BrowserLike) => Promise<T>,
): Promise<T> {
  const session = await openProfile(config, platform)
  try {
    return await fn(session.browser)
  } finally {
    await session.close()
  }
}

/**
 * 采集期间复用的 profile 会话。
 *
 * 同一平台的多个商品要共用同一个 context：反复开关 persistent context
 * 又慢又容易锁住 userDataDir。空闲 90 秒后自动关闭。
 */
const PROFILE_IDLE_MS = 90_000
interface ProfileSlot {
  session: ProfileSession
  timer?: ReturnType<typeof setTimeout>
}
const profileSlots = new WeakMap<Context, Map<string, ProfileSlot>>()

export async function acquireProfile(
  ctx: Context,
  config: Config,
  platform: string,
): Promise<BrowserLike> {
  // 登录窗口开着就直接用它：既拿到最新 cookie，也避免同一 userDataDir 被锁
  const win = getLoginWindow(ctx, platform)
  if (win) return win.browser

  let map = profileSlots.get(ctx)
  if (!map) {
    map = new Map()
    profileSlots.set(ctx, map)
    ctx.effect(() => async () => {
      const slots = [...map!.values()]
      map!.clear()
      await Promise.all(slots.map((s) => {
        if (s.timer) clearTimeout(s.timer)
        return s.session.close()
      }))
    })
  }

  const existing = map.get(platform)
  if (existing && !(await ensureAlive(existing.session))) {
    map.delete(platform)
  }
  if (map.get(platform)) {
    const existing = map.get(platform)!
    if (existing.timer) clearTimeout(existing.timer)
    existing.timer = setTimeout(() => {
      map!.delete(platform)
      void existing.session.close()
    }, PROFILE_IDLE_MS)
    existing.timer.unref?.()
    return existing.session.browser
  }

  const session = await openProfile(config, platform)
  const slot: ProfileSlot = { session }
  slot.timer = setTimeout(() => {
    map!.delete(platform)
    void session.close()
  }, PROFILE_IDLE_MS)
  slot.timer.unref?.()
  map.set(platform, slot)
  return session.browser
}

/** 手动关掉某平台的采集会话（例如刚登录完，想立刻用新 cookie） */
export async function closeProfile(ctx: Context, platform: string): Promise<void> {
  const map = profileSlots.get(ctx)
  const slot = map?.get(platform)
  if (!slot || !map) return
  map.delete(platform)
  if (slot.timer) clearTimeout(slot.timer)
  await slot.session.close()
}

/**
 * 需要人操作时保持打开的登录窗口（拼多多手机号登录）。
 * 插件卸载时统一关闭，避免留下孤儿窗口。
 */
const loginWindows = new WeakMap<Context, Map<string, ProfileSession>>()

/**
 * 句柄可能指向一个已经关掉的浏览器（用户关窗口、进程被杀）。
 * 复用它只会得到 "Target page, context or browser has been closed"，
 * 所以复用前先试开一个页面探活，死了就丢掉重开。
 */
async function ensureAlive(session: ProfileSession | undefined): Promise<ProfileSession | undefined> {
  if (!session) return undefined
  try {
    const page = await session.browser.newPage()
    await page.close?.()
    return session
  } catch {
    await session.close?.().catch(() => undefined)
    return undefined
  }
}

function forgetLoginWindow(ctx: Context, platform: string): void {
  loginWindows.get(ctx)?.delete(platform)
}

export function getLoginWindow(ctx: Context, platform: string): ProfileSession | undefined {
  return loginWindows.get(ctx)?.get(platform)
}

export async function keepLoginWindow(
  ctx: Context,
  config: Config,
  platform: string,
  headed = false,
  viewport?: { width: number; height: number },
): Promise<ProfileSession> {
  let map = loginWindows.get(ctx)
  if (!map) {
    map = new Map()
    loginWindows.set(ctx, map)
    ctx.effect(() => () => {
      const sessions = [...map!.values()]
      map!.clear()
      return Promise.all(sessions.map((s) => s.close())).then(() => undefined)
    })
  }
  const cached = map.get(platform)
  if (cached) {
    if (await ensureAlive(cached)) return cached
    forgetLoginWindow(ctx, platform)
  }

  // 采集侧的 profile 会话可能已经占着这个目录，必须复用，
  // 否则同一 userDataDir 开第二个 Chrome 会直接把进程顶掉（exitCode=21）。
  const slots = profileSlots.get(ctx)
  const slot = slots?.get(platform)
  if (slot) {
    slots!.delete(platform)
    if (slot.timer) clearTimeout(slot.timer)
    if (await ensureAlive(slot.session)) {
      map.set(platform, slot.session)
      return slot.session
    }
  }

  const session = await openProfile(config, platform, { forceHeaded: headed, viewport })
  map.set(platform, session)
  return session
}

export async function closeLoginWindow(ctx: Context, platform: string): Promise<boolean> {
  const map = loginWindows.get(ctx)
  const session = map?.get(platform)
  if (!session || !map) return false
  map.delete(platform)
  await session.close()
  return true
}

export { IDLE_CLOSE_MS, CONTEXT_IDLE_MS }
/**
 * 反检测初始化脚本（每个新页面注入一次）。
 *
 * 无头模式即使加了 --disable-blink-features 仍会暴露 navigator.webdriver=true，
 * 平台据此直接判定自动化。这里把最常见的几个指纹抹平：
 *   webdriver / plugins / languages / chrome.runtime / permissions.query
 * 目标不是"骗过所有检测"，而是"别在第一步就被筛掉"。
 */
export const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, "webdriver", { get: () => undefined })
  Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] })
  Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] })
  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 })
  window.chrome = window.chrome || { runtime: {} }
  if (navigator.permissions && navigator.permissions.query) {
    const original = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (params) => params && params.name === "notifications"
      ? Promise.resolve({ state: Notification.permission })
      : original(params)
  }
`

/** 给 context 装上 stealth（幂等） */
export async function applyStealth(browser: BrowserLike): Promise<void> {
  const ctx = browser as unknown as { addInitScript?: (script: string) => Promise<void> }
  if (!ctx.addInitScript) return
  await ctx.addInitScript(STEALTH_SCRIPT).catch(() => undefined)
}
