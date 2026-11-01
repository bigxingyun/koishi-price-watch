import type { Context } from 'koishi'

import type { Config } from '../index'
import * as repo from '../store/repo'
import {
  ANTI_VERSIONS,
  type AntiHealth,
  type AntiPlatform,
  describeHealth,
  initialHealth,
  isUsable,
  afterFailure,
  afterSuccess,
  afterUnimplemented,
  AntiNotImplementedError,
} from './health'

/**
 * 反爬协议注册表与统一调用入口（L1.5）。
 *
 * 用法（采集层将来按需调用）：
 *
 *   const price = await withAnti(ctx, config, 'jd', async (anti) => {
 *     return fetchPriceWithH5st(anti)
 *   })
 *   失败时返回 null，采集层照常走浏览器/API 兜底 —— **绝不因为协议坏了而中断采集**。
 */

const PROVIDERS: Partial<Record<AntiPlatform, () => Promise<unknown>>> = {
  // 待填：京东 h5st、拼多多 anti_content、淘宝 x5sec
}

const CACHE = new WeakMap<Context, Map<AntiPlatform, AntiHealth>>()

function cacheOf(ctx: Context): Map<AntiPlatform, AntiHealth> {
  let map = CACHE.get(ctx)
  if (!map) {
    map = new Map()
    CACHE.set(ctx, map)
  }
  return map
}

async function loadHealth(ctx: Context, platform: AntiPlatform): Promise<AntiHealth> {
  const cache = cacheOf(ctx)
  const cached = cache.get(platform)
  if (cached) return cached

  const raw = await repo.metaGet(ctx, `anti:${platform}`).catch(() => null)
  let health = initialHealth(platform)
  if (raw) {
    try {
      health = { ...health, ...(JSON.parse(raw) as Partial<AntiHealth>) }
    } catch {
      health = initialHealth(platform)
    }
  }
  // 版本表为准：没实现的一律标 unimplemented，避免历史上写过的 ok 残留
  if (!ANTI_VERSIONS[platform]) health = afterUnimplemented(health)
  cache.set(platform, health)
  return health
}

async function saveHealth(ctx: Context, health: AntiHealth): Promise<void> {
  cacheOf(ctx).set(health.platform, health)
  await repo.metaSet(ctx, `anti:${health.platform}`, JSON.stringify(health)).catch(() => undefined)
}

/** 三个平台的健康状态（给自检/状态指令用） */
export async function antiReport(ctx: Context, config: Config): Promise<AntiHealth[]> {
  const out: AntiHealth[] = []
  for (const platform of ['jd', 'pdd', 'taobao'] as AntiPlatform[]) {
    const enabled = config.anti?.enabled !== false && config.anti?.[platform]?.enabled !== false
    const health = await loadHealth(ctx, platform)
    out.push(enabled ? health : { ...health, state: 'disabled' })
  }
  return out
}

export function antiLines(healths: AntiHealth[]): string[] {
  const zh: Record<string, string> = { jd: '京东', pdd: '拼多多', taobao: '淘宝' }
  const lines = ['反爬协议（隔离模块，失效不影响采集主线）：']
  for (const health of healths) {
    lines.push(`  ${zh[health.platform] ?? health.platform}：${describeHealth(health)}`)
    if (health.lastReason) lines.push(`    原因：${health.lastReason.slice(0, 60)}`)
  }
  const usable = healths.filter((h) => isUsable(h, Date.now())).length
  lines.push('', usable ? `可用 ${usable} 个` : '当前没有可用的反爬协议，采集走浏览器/人工兜底')
  return lines
}

/**
 * 统一调用入口：协议不可用或失败都不抛错，只返回 null 并记健康状态。
 * 这样采集主线永远不会因为协议问题中断。
 */
export async function withAnti<T>(
  ctx: Context,
  config: Config,
  platform: AntiPlatform,
  run: () => Promise<T>,
): Promise<T | null> {
  if (config.anti?.enabled === false) return null
  if (config.anti?.[platform]?.enabled === false) return null

  const health = await loadHealth(ctx, platform)
  const now = Date.now()

  if (health.state === 'unimplemented' && !PROVIDERS[platform]) return null
  if (!isUsable(health, now)) return null

  const provider = PROVIDERS[platform]
  if (!provider) return null

  try {
    await provider()
    const result = await run()
    await saveHealth(ctx, afterSuccess(health, Date.now()))
    return result
  } catch (error) {
    if (error instanceof AntiNotImplementedError) {
      await saveHealth(ctx, afterUnimplemented(health))
      return null
    }
    await saveHealth(ctx, afterFailure(health, error, Date.now()))
    return null
  }
}

export { AntiProtocolStaleError } from './health'
