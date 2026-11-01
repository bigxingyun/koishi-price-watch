import { Context } from 'koishi'

import { money, shiftDay, toDay } from '../constants'
import type { Config } from '../index'
import type { PwModel, PwStat, PwTarget } from '../store/model'
import * as repo from '../store/repo'

/**
 * 阈值告警。
 *
 * 与日报的区别：
 * - 日报是「定时全量」，告警是「事件触发」
 * - 告警必须**短**（单条 ≤300 字符），所以只发文本，不走图片/报纸模板
 * - 告警必须**不烦人**，所以有三重去重：同型号同类 24h 一次、单目标每日上限、全局每日上限
 */

export type AlertKind = 'surge' | 'plunge' | 'newLow' | 'dailyDrop'

export interface AlertItem {
  modelId: string
  name: string
  price: number
  kind: AlertKind
  headline: string
  detail: string
}

const KIND_LABEL: Record<AlertKind, string> = {
  surge: '七日急涨',
  plunge: '七日急跌',
  newLow: '创三十日新低',
  dailyDrop: '单日下跌',
}

/** 判断哪些型号触发了告警（纯逻辑，便于测试） */
export function detectAlerts(
  stats: PwStat[],
  models: PwModel[],
  options: {
    r7Threshold: number
    dailyDropThreshold: number
    newLowEnabled: boolean
    lows: Map<string, number>
  },
): AlertItem[] {
  const nameMap = new Map(models.map((m) => [m.id, m.name]))
  const alerts: AlertItem[] = []

  for (const stat of stats) {
    const name = nameMap.get(stat.modelId) ?? stat.modelId
    const base = { modelId: stat.modelId, name, price: stat.price }

    if (stat.r7 >= options.r7Threshold) {
      alerts.push({
        ...base,
        kind: 'surge',
        headline: `${name} 七日上涨 ${(stat.r7 * 100).toFixed(1)}%`,
        detail: `现价 ${money(stat.price)}　${stat.grade} ${stat.modifier}　分位 ${(stat.q30 * 100).toFixed(0)}%`,
      })
    } else if (stat.r7 <= -Math.abs(options.r7Threshold)) {
      alerts.push({
        ...base,
        kind: 'plunge',
        headline: `${name} 七天下跌 ${(Math.abs(stat.r7) * 100).toFixed(1)}%`,
        detail: `现价 ${money(stat.price)}　${stat.grade} ${stat.modifier}　分位 ${(stat.q30 * 100).toFixed(0)}%`,
      })
    } else if (stat.d1 <= -Math.abs(options.dailyDropThreshold)) {
      alerts.push({
        ...base,
        kind: 'dailyDrop',
        headline: `${name} 单日下跌 ${(Math.abs(stat.d1) * 100).toFixed(1)}%`,
        detail: `现价 ${money(stat.price)}　${stat.grade} ${stat.modifier}`,
      })
    } else if (options.newLowEnabled && stat.n30 >= 21) {
      const low = options.lows.get(stat.modelId)
      if (low && stat.price <= low) {
        alerts.push({
          ...base,
          kind: 'newLow',
          headline: `${name} 创三十日新低`,
          detail: `现价 ${money(stat.price)}　${stat.grade} ${stat.modifier}　置信度${stat.confidence}`,
        })
      }
    }
  }

  return alerts
}

/** 取每个型号最近 30 日的最低代表价 */
export async function loadLows(ctx: Context, day = toDay()): Promise<Map<string, number>> {
  const daily = await repo.getDaily(ctx, [], shiftDay(day, -30))
  const lows = new Map<string, number>()
  for (const row of daily) {
    if (!row.median) continue
    const prev = lows.get(row.modelId)
    if (prev === undefined || row.median < prev) lows.set(row.modelId, row.median)
  }
  return lows
}

/** 生成待发告警（已过 24h 去重） */
export async function collectAlerts(
  ctx: Context,
  config: Config,
  day = toDay(),
): Promise<AlertItem[]> {
  if (!config.alert.enabled) return []

  const stats = (await repo.getAllStats(ctx)).filter((s) => s.n30 >= 7)
  if (!stats.length) return []

  const models = await repo.listModels(ctx)
  const lows = await loadLows(ctx, day)
  const candidates = detectAlerts(stats, models, {
    r7Threshold: config.alert.r7Threshold,
    dailyDropThreshold: config.alert.dailyDropThreshold,
    newLowEnabled: config.alert.newLowEnabled,
    lows,
  })

  // 同型号同类 24 小时内只发一次
  const fresh: AlertItem[] = []
  for (const alert of candidates) {
    const key = `alertSent:${alert.modelId}:${alert.kind}`
    const last = Number(await repo.metaGet(ctx, key)) || 0
    if (Date.now() - last < 24 * 3600_000) continue
    fresh.push(alert)
  }
  return fresh
}

/** 把告警发给所有 alert 目标（纯文本，失败计数复用 pw_target） */
export async function pushAlerts(
  ctx: Context,
  config: Config,
  options: { dryRun?: boolean } = {},
): Promise<{ sent: number; skipped: number }> {
  const logger = ctx.logger('price-watch')
  const alerts = await collectAlerts(ctx, config)
  if (!alerts.length) return { sent: 0, skipped: 0 }

  const targets = (await repo.listTargets(ctx)).filter((t) => t.kind === 'alert')
  if (!targets.length) {
    logger.info('有 %d 条告警，但没有 alert 类型的推送目标', alerts.length)
    return { sent: 0, skipped: alerts.length }
  }

  const dryRun = options.dryRun ?? config.advanced.dryRun
  let sent = 0
  let skipped = 0

  for (const target of targets) {
    const quota = await takeQuota(ctx, target, config.alert.perChannelDaily)
    if (quota <= 0) {
      skipped += alerts.length
      continue
    }

    for (const alert of alerts.slice(0, quota)) {
      const text = `⚠ ${KIND_LABEL[alert.kind]}\n${alert.headline}\n${alert.detail}`
      if (dryRun) {
        logger.info('[dryRun] 告警 → %s/%s：%s', target.platform, target.channelId, alert.headline)
        sent++
        continue
      }
      const bot = ctx.bots.find((b) => b.platform === target.platform
        && (!target.selfId || b.selfId === target.selfId))
      if (!bot) break
      try {
        await bot.sendMessage(target.channelId, text, target.guildId || undefined)
        await repo.markTargetFailed(ctx, target.id, 0)
        await repo.metaSet(ctx, `alertSent:${alert.modelId}:${alert.kind}`, String(Date.now()))
        sent++
      } catch (error) {
        logger.warn('告警发送失败：%s', (error as Error).message)
        await repo.markTargetFailed(ctx, target.id, target.failCount + 1)
        break
      }
    }
  }

  return { sent, skipped }
}

/** 单目标当日剩余配额 */
async function takeQuota(ctx: Context, target: PwTarget, daily: number): Promise<number> {
  const key = `alertQuota:${target.id}:${toDay()}`
  const used = Number(await repo.metaGet(ctx, key)) || 0
  const left = Math.max(0, daily - used)
  if (left > 0) await repo.metaSet(ctx, key, String(used + 1))
  return left
}

