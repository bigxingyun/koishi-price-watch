import type { Context } from 'koishi'

import { STATUS, toDay } from '../constants'
import * as repo from '../store/repo'
import { priceLooksSane } from '../domain/quote'

/**
 * 数据质量汇总（L3）。
 *
 * 采集链路的结论都落在 pw_snapshot.status 上，这里把它聚合成人话：
 * 今天收了多少条、多少条被质量闸门拦下、每个平台最后一次失败是什么原因。
 *
 * 用途：`价格 管理 自检` 的「数据质量」区块，以及日报脚注。
 */

export interface QualitySummary {
  day: number
  total: number
  ok: number
  failed: number
  outOfStock: number
  delisted: number
  suspicious: number
  /** 每个平台最后一条失败原因 */
  lastFailures: Array<{ platform: string; reason: string; offerId: number }>
}

/** 状态 → 人话（快照表没有 note 字段，只能按状态码解释） */
const STATUS_TEXT: Record<number, string> = {
  [STATUS.OK]: '正常',
  [STATUS.OUT_OF_STOCK]: '缺货',
  [STATUS.DELISTED]: '已下架',
  [STATUS.SUSPICIOUS]: '价格可疑被拦下',
  [STATUS.FAILED]: '抓取失败',
}

export async function qualitySummary(ctx: Context, day = toDay()): Promise<QualitySummary> {
  const offers = await repo.listOffers(ctx)
  const offerPlatform = new Map(offers.map((o) => [o.id, o.platform]))

  const models = await repo.listModels(ctx)
  const snapshots = models.length ? await repo.getSnapshots(ctx, models.map((m) => m.id), day) : []
  // 跨天查询：getSnapshots 只给当天的，足够做「今日质量」
  const summary: QualitySummary = {
    day,
    total: snapshots.length,
    ok: 0,
    failed: 0,
    outOfStock: 0,
    delisted: 0,
    suspicious: 0,
    lastFailures: [],
  }

  const lastByPlatform = new Map<string, { reason: string; offerId: number }>()
  for (const snap of snapshots) {
    switch (snap.status) {
      case STATUS.OK:
        summary.ok++
        break
      case STATUS.OUT_OF_STOCK:
        summary.outOfStock++
        break
      case STATUS.DELISTED:
        summary.delisted++
        break
      case STATUS.SUSPICIOUS:
        summary.suspicious++
        summary.failed++
        break
      default:
        summary.failed++
        break
    }
    if (snap.status !== STATUS.OK) {
      const platform = offerPlatform.get(snap.offerId) ?? 'unknown'
      lastByPlatform.set(platform, {
        reason: STATUS_TEXT[snap.status] ?? String(snap.status),
        offerId: snap.offerId,
      })
    }
  }

  summary.lastFailures = [...lastByPlatform.entries()].map(([platform, v]) => ({ platform, ...v }))
  return summary
}

/** 给日报脚注用的一行 */
export function qualityLine(summary: QualitySummary): string {
  const parts = [`成功 ${summary.ok}`]
  if (summary.failed) parts.push(`失败 ${summary.failed}`)
  if (summary.suspicious) parts.push(`可疑 ${summary.suspicious}`)
  if (summary.outOfStock) parts.push(`缺货 ${summary.outOfStock}`)
  if (summary.delisted) parts.push(`下架 ${summary.delisted}`)
  return `数据质量：${parts.join(' · ')}（共 ${summary.total} 条）`
}

export { priceLooksSane }
