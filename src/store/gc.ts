import { Context } from 'koishi'

import { shiftDay, toDay } from '../constants'
import type { Config } from '../index'
import { metaGet, metaDel } from './repo'
import * as repo from './repo'

/**
 * 数据治理：保留期清理。
 *
 * 设计文档 §1.5 承诺的是「明细 → 周聚合 → 冷却删除」三级生命周期。
 * 当前实现只做**分批删除**（不做周聚合表），因为：
 * - 22k 行/年的量级下，周聚合带来的收益为负（多一张表、多一处算法迁移成本）
 * - 真正需要控体积的是快照明细，而它已经按天唯一
 * 这条差异在 readme 与设计文档里如实标注，不假装实现了降采样。
 */

export interface GcResult {
  snapshots: number
  daily: number
  manual: number
  dryRun: boolean
  cutoff: { snapshot: number; daily: number }
}

/** 按天窗口分批删除，避免一条 DELETE 扫全表把数据库锁住 */
async function deleteByDayRange(
  ctx: Context,
  table: 'pw_snapshot' | 'pw_daily',
  fromDay: number,
  toDay_: number,
  batchDays: number,
): Promise<number> {
  let deleted = 0
  let cursor = fromDay
  while (cursor < toDay_) {
    const end = Math.min(toDay_, shiftDay(cursor, batchDays))
    const res = await ctx.database.remove(table, { day: { $gte: cursor, $lt: end } })
    deleted += res.matched ?? 0
    cursor = end
  }
  return deleted
}

export async function gc(
  ctx: Context,
  config: Config,
  options: { dryRun?: boolean; batchDays?: number } = {},
): Promise<GcResult> {
  const today = toDay()
  const snapshotCutoff = shiftDay(today, -config.data.snapshotDays)
  const dailyCutoff = shiftDay(today, -config.data.dailyDays)
  const batchDays = options.batchDays ?? 90
  const dryRun = options.dryRun ?? false

  const firstDay = Number(await metaGet(ctx, 'firstDay')) || snapshotCutoff

  if (dryRun) {
    const expiredSnapshots = (await repo.getSnapshots(ctx, [], firstDay)).filter((s) => s.day < snapshotCutoff)
    const expiredDaily = (await repo.getDaily(ctx, [], dailyCutoff)).filter((d) => d.day < dailyCutoff)
    return {
      snapshots: expiredSnapshots.length,
      daily: expiredDaily.length,
      manual: 0,
      dryRun,
      cutoff: { snapshot: snapshotCutoff, daily: dailyCutoff },
    }
  }

  const snapshots = await deleteByDayRange(ctx, 'pw_snapshot', firstDay, snapshotCutoff, batchDays)
  const daily = await deleteByDayRange(ctx, 'pw_daily', firstDay, dailyCutoff, batchDays)

  // 清理过期的人工录入 meta（键形如 manual:{offerId}:{day}）
  let manual = 0
  const metas = await ctx.database.get('pw_meta', {})
  for (const row of metas) {
    if (!row.key.startsWith('manual:')) continue
    const day = Number(row.key.split(':').pop())
    if (day && day < snapshotCutoff) {
      await metaDel(ctx, row.key)
      manual++
    }
  }

  return { snapshots, daily, manual, dryRun, cutoff: { snapshot: snapshotCutoff, daily: dailyCutoff } }
}

/** 各表行数与数据库文件体积（doctor 用） */
export async function stats(ctx: Context): Promise<Array<{ table: string; rows: number }>> {
  const tables: Array<['pw_model' | 'pw_offer' | 'pw_snapshot' | 'pw_daily' | 'pw_stat' | 'pw_sub' | 'pw_target' | 'pw_meta', string]> = [
    ['pw_model', '型号'], ['pw_offer', '报价'], ['pw_snapshot', '日快照'],
    ['pw_daily', '日聚合'], ['pw_stat', '指标'], ['pw_sub', '订阅'],
    ['pw_target', '推送目标'], ['pw_meta', '状态'],
  ]
  const result: Array<{ table: string; rows: number }> = []
  for (const [table, label] of tables) {
    // 不传 fields：各表主键不同（有的是 id，有的是 modelId），
    // 硬指定 'id' 会在 pw_stat 上抛 no such column: id
    const rows = (await ctx.database.get(table, {})).length
    result.push({ table: label, rows })
  }
  return result
}
