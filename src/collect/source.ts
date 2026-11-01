import type { Context } from 'koishi'

import type { Config, DataSource } from '../index'
import { apiReady } from '../api'
import * as repo from '../store/repo'

/**
 * 数据源决策（混合模式的核心）。
 *
 * 优先级：**聊天里临时设置 > 配置 > auto 兜底**
 * - 聊天里设置：`价格 管理 数据源 京东 api`，存在 pw_meta（`source:jd`），重启不丢
 * - 配置：插件配置「数据源」分组，是长期默认
 * - auto：有密钥就用 API，没密钥但有浏览器就用浏览器，两者都没有就 manual
 *
 * 这样「用户自己决定走 api 还是爬虫」在运行时就能改，不用重启、不用编辑配置文件。
 */

export interface SourceDecision {
  source: DataSource
  /** 为什么选它 —— 自检和状态里要显示，避免用户以为设置没生效 */
  reason: string
  /** 是否来自聊天里的临时设置 */
  fromChat: boolean
}

const PLATFORMS = ['jd', 'pdd', 'taobao'] as const

export function sourceOf(config: Config, platform: string): DataSource {
  const value = (config.source as Record<string, DataSource> | undefined)?.[platform]
  return value ?? 'auto'
}

export async function resolveSource(
  ctx: Context,
  config: Config,
  platform: string,
): Promise<SourceDecision> {
  // 本地平台（mock / manual）不需要网络也不需要浏览器，直接走适配器。
  // 之前它们被 auto 判成 manual，导致「演示数据一条都采不到」。
  if (!['jd', 'pdd', 'taobao'].includes(platform)) {
    return { source: 'browser', reason: '本地平台直接走适配器', fromChat: false }
  }

  // 拼多多网页端价格会被打码（「前往APP查看价格」）、京东搜索有验证墙，
  // 两家都不再尝试网页抓取，只走官方 API。
  if (platform === 'pdd' || platform === 'jd') {
    return { source: 'api', reason: '该平台网页端已不可用，只走官方 API', fromChat: false }
  }

  const override = (await repo.metaGet(ctx, `source:${platform}`)) as DataSource | null
  if (override && ['auto', 'api', 'browser', 'manual'].includes(override)) {
    return { source: override, reason: `聊天里设置为 ${override}`, fromChat: true }
  }

  const configured = sourceOf(config, platform)
  if (configured !== 'auto') {
    return { source: configured, reason: `配置指定 ${configured}`, fromChat: false }
  }

  if (apiReady(config, platform)) {
    return { source: 'api', reason: '已配置联盟密钥（auto）', fromChat: false }
  }
  if (config.collect.browserEnabled) {
    return { source: 'browser', reason: '未配置密钥，回退浏览器（auto）', fromChat: false }
  }
  return { source: 'manual', reason: '既无密钥也未开浏览器（auto）', fromChat: false }
}

export async function setSource(ctx: Context, platform: string, source: DataSource | 'clear'): Promise<void> {
  const key = `source:${platform}`
  if (source === 'clear') {
    await repo.metaDel(ctx, key)
    return
  }
  await repo.metaSet(ctx, key, source)
}

/** 给状态命令用：三个平台的最终数据源 */
export async function sourceTable(ctx: Context, config: Config): Promise<Array<SourceDecision & { platform: string }>> {
  const out: Array<SourceDecision & { platform: string }> = []
  for (const platform of PLATFORMS) {
    out.push({ platform, ...(await resolveSource(ctx, config, platform)) })
  }
  return out
}
