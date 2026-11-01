import { Context } from 'koishi'

import { STATUS, type Category } from '../constants'
import type { PwDaily, PwModel, PwOffer, PwSnapshot, PwStat, PwSub, PwTarget } from './model'

/** 查询归一化：小写 + 去空格 + 全角括号统一 */
export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[×＊*]/g, 'x')
    .replace(/[（）]/g, (m) => (m === '（' ? '(' : ')'))
    .replace(/\s+/g, '')
}

// ── 型号 ──────────────────────────────────────

export async function countModels(ctx: Context): Promise<number> {
  const rows = await ctx.database.get('pw_model', {}, ['id'])
  return rows.length
}

export async function listModels(ctx: Context, category?: Category): Promise<PwModel[]> {
  const rows = (await ctx.database.get('pw_model', category ? { category } : {})) as PwModel[]
  return rows.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
}

export async function getModel(ctx: Context, id: string): Promise<PwModel | undefined> {
  const [row] = await ctx.database.get('pw_model', { id })
  return row as PwModel | undefined
}

export interface ModelMatch {
  model: PwModel
  score: number
}

/**
 * 模糊匹配型号。手写打分，不引第三方模糊匹配库：
 * 精确 id > 精确 name > 精确 alias > 互相包含 > alias 包含。
 */
export async function searchModels(ctx: Context, query: string, limit = 5): Promise<ModelMatch[]> {
  const q = normalizeQuery(query)
  if (!q) return []
  const all = (await ctx.database.get('pw_model', {})) as PwModel[]

  const scored: ModelMatch[] = []
  for (const model of all) {
    const id = normalizeQuery(model.id)
    const name = normalizeQuery(model.name)
    const aliases = (model.aliases || []).map(normalizeQuery)

    let score = 0
    if (id === q) score = 100
    else if (name === q) score = 92
    else if (aliases.includes(q)) score = 88
    else if (name.includes(q)) score = 74
    else if (q.includes(name)) score = 68
    else if (aliases.some((a) => a.includes(q) || q.includes(a))) score = 60
    else if (id.includes(q)) score = 50

    if (score > 0) scored.push({ model, score: score + model.priority * 0.1 })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

export async function upsertModel(ctx: Context, row: Omit<PwModel, 'createdAt'> & { createdAt?: Date }) {
  const data = { ...row, createdAt: row.createdAt ?? new Date() }
  const res = await ctx.database.set('pw_model', { id: row.id }, data)
  if (res.matched) return false
  await ctx.database.create('pw_model', data)
  return true
}

export async function removeModel(ctx: Context, id: string): Promise<boolean> {
  const res = await ctx.database.remove('pw_model', { id })
  return !!res.matched
}

// ── 报价 ──────────────────────────────────────

export async function countOffers(ctx: Context): Promise<number> {
  const rows = await ctx.database.get('pw_offer', {}, ['id'])
  return rows.length
}

export async function listOffers(ctx: Context, modelId?: string): Promise<PwOffer[]> {
  return ctx.database.get('pw_offer', modelId ? { modelId } : {}) as Promise<PwOffer[]>
}

/** 唯一键是 (platform, itemId)，所以先按唯一键 set，未命中再 create —— 幂等重跑 */
export async function upsertOffer(
  ctx: Context,
  row: Omit<PwOffer, 'id' | 'createdAt'> & { createdAt?: Date },
): Promise<boolean> {
  const createdAt = row.createdAt ?? new Date()
  const res = await ctx.database.set(
    'pw_offer',
    { platform: row.platform, itemId: row.itemId },
    { ...row, createdAt },
  )
  if (res.matched) return false
  await ctx.database.create('pw_offer', { ...row, createdAt })
  return true
}

// ── 日快照 ────────────────────────────────────

/** 唯一键是 (offerId, day)：同一天重跑只覆盖，不新增行 */
export async function upsertSnapshot(
  ctx: Context,
  row: Omit<PwSnapshot, 'id' | 'ts'> & { ts?: Date },
): Promise<boolean> {
  const ts = row.ts ?? new Date()
  const res = await ctx.database.set(
    'pw_snapshot',
    { offerId: row.offerId, day: row.day },
    {
      modelId: row.modelId,
      price: row.price,
      listPrice: row.listPrice,
      status: row.status,
      samples: row.samples,
      ts,
    },
  )
  if (res.matched) {
    await ctx.database.set('pw_snapshot', { offerId: row.offerId, day: row.day }, { ts })
    return false
  }
  await ctx.database.create('pw_snapshot', { ...row, ts })
  return true
}

export async function getSnapshots(
  ctx: Context,
  modelIds: string[],
  sinceDay: number,
): Promise<PwSnapshot[]> {
  if (!modelIds.length) return []
  return ctx.database.get('pw_snapshot', {
    modelId: { $in: modelIds },
    day: { $gte: sinceDay },
  }) as Promise<PwSnapshot[]>
}

/** 按 offer 取最近 N 天成功快照（用于算「到手价」与平台报价对照） */
export async function getRecentSnapshots(ctx: Context, sinceDay: number): Promise<PwSnapshot[]> {
  return ctx.database.get('pw_snapshot', {
    day: { $gte: sinceDay },
    status: STATUS.OK,
  }) as Promise<PwSnapshot[]>
}

/** 该 offer 在 beforeDay 之前最近一次成功价（用于异常值判定） */
export async function getLastOkPrice(
  ctx: Context,
  offerId: number,
  beforeDay: number,
): Promise<number | undefined> {
  const rows = (await ctx.database.get('pw_snapshot', {
    offerId,
    day: { $lt: beforeDay },
    status: STATUS.OK,
  })) as PwSnapshot[]
  if (!rows.length) return undefined
  rows.sort((a, b) => b.day - a.day)
  return rows[0].price || undefined
}

// ── 日聚合 ────────────────────────────────────

export async function upsertDaily(ctx: Context, row: Omit<PwDaily, 'id'>): Promise<void> {
  const res = await ctx.database.set(
    'pw_daily',
    { modelId: row.modelId, day: row.day },
    {
      low: row.low,
      high: row.high,
      median: row.median,
      offerCount: row.offerCount,
      coverage: row.coverage,
    },
  )
  if (!res.matched) await ctx.database.create('pw_daily', row)
}

export async function getDaily(
  ctx: Context,
  modelIds: string[],
  sinceDay: number,
): Promise<PwDaily[]> {
  // 空数组 = 不过滤型号（告警要全量看三十日最低价）
  const query: Record<string, unknown> = { day: { $gte: sinceDay } }
  if (modelIds.length) query.modelId = { $in: modelIds }
  return ctx.database.get('pw_daily', query as never) as Promise<PwDaily[]>
}

// ── 指标 ──────────────────────────────────────

export async function upsertStat(ctx: Context, row: Omit<PwStat, 'updatedAt'>): Promise<void> {
  await ctx.database.upsert('pw_stat', [{ ...row, updatedAt: new Date() }])
}

export async function getAllStats(ctx: Context): Promise<PwStat[]> {
  return ctx.database.get('pw_stat', {}) as Promise<PwStat[]>
}

export async function getStat(ctx: Context, modelId: string): Promise<PwStat | undefined> {
  const [row] = await ctx.database.get('pw_stat', { modelId })
  return row as PwStat | undefined
}

// ── 推送目标 ──────────────────────────────────

export async function listTargets(ctx: Context, kind?: string): Promise<PwTarget[]> {
  const rows = (await ctx.database.get('pw_target', {})) as PwTarget[]
  return rows.filter((t) => t.active && (!kind || t.kind === kind))
}

export interface TargetInput {
  platform: string
  channelId: string
  selfId?: string
  guildId?: string
  kind: string
  mode: string
}

/** 唯一键是 (platform, selfId, channelId, kind) */
export async function addTarget(ctx: Context, input: TargetInput): Promise<boolean> {
  const payload = {
    platform: input.platform,
    selfId: input.selfId || '',
    channelId: input.channelId,
    guildId: input.guildId || '',
    kind: input.kind,
    mode: input.mode,
    active: true,
    failCount: 0,
    createdAt: new Date(),
  }
  const res = await ctx.database.set(
    'pw_target',
    { platform: payload.platform, selfId: payload.selfId, channelId: payload.channelId, kind: payload.kind },
    { mode: payload.mode, active: true, failCount: 0 },
  )
  if (res.matched) return false
  await ctx.database.create('pw_target', payload)
  return true
}

export async function removeTarget(ctx: Context, id: number): Promise<boolean> {
  const res = await ctx.database.remove('pw_target', { id })
  return !!res.matched
}

export async function markTargetFailed(ctx: Context, id: number, failCount: number): Promise<void> {
  await ctx.database.set('pw_target', { id }, { failCount, active: failCount < 3 })
}

/** 首次启动时把配置里的 targets 作为种子导入（表里已有数据则完全不动） */
export async function seedTargets(ctx: Context, seeds: TargetInput[]): Promise<number> {
  if (!seeds?.length) return 0
  const existing = await ctx.database.get('pw_target', {}, ['id'])
  if (existing.length) return 0
  let added = 0
  for (const seed of seeds) {
    if (await addTarget(ctx, seed)) added++
  }
  return added
}

// ── 订阅 ──────────────────────────────────────

export interface SubInput {
  platform: string
  channelId: string
  userId: string
  modelId: string
  kind: string
  threshold: number
}

/** 唯一键是 (platform, channelId, userId, modelId, kind) */
export async function addSub(ctx: Context, input: SubInput): Promise<boolean> {
  const res = await ctx.database.set(
    'pw_sub',
    {
      platform: input.platform,
      channelId: input.channelId,
      userId: input.userId,
      modelId: input.modelId,
      kind: input.kind,
    },
    { threshold: input.threshold },
  )
  if (res.matched) return false
  await ctx.database.create('pw_sub', { ...input, createdAt: new Date() })
  return true
}

export async function removeSub(
  ctx: Context,
  platform: string,
  channelId: string,
  modelId: string,
): Promise<boolean> {
  const res = await ctx.database.remove('pw_sub', { platform, channelId, modelId })
  return !!res.matched
}

export async function listSubs(ctx: Context, platform?: string, channelId?: string): Promise<PwSub[]> {
  const query: Record<string, unknown> = {}
  if (platform) query.platform = platform
  if (channelId) query.channelId = channelId
  return ctx.database.get('pw_sub', query as never) as Promise<PwSub[]>
}

/**
 * 某个会话订阅的型号 id 列表（含 `gpu:*` 这种整组订阅的展开）。
 * 日报的「我的关注」用它。
 */
export async function resolveWatchIds(
  ctx: Context,
  platform: string,
  channelId: string,
  limit = 5,
): Promise<string[]> {
  const subs = await listSubs(ctx, platform, channelId)
  if (!subs.length) return []
  const models = await listModels(ctx)
  const ids: string[] = []
  for (const sub of subs) {
    if (sub.modelId.endsWith(':*')) {
      const category = sub.modelId.slice(0, -2)
      for (const model of models) {
        if (model.category === category && !ids.includes(model.id)) ids.push(model.id)
      }
    } else if (!ids.includes(sub.modelId)) {
      ids.push(sub.modelId)
    }
  }
  return ids.slice(0, limit)
}

// ── 元数据 ────────────────────────────────────

export async function metaGet(ctx: Context, key: string): Promise<string | undefined> {
  const [row] = await ctx.database.get('pw_meta', { key })
  return row?.value
}

export async function metaSet(ctx: Context, key: string, value: string): Promise<void> {
  await ctx.database.upsert('pw_meta', [{ key, value, updatedAt: new Date() }])
}

export async function metaDel(ctx: Context, key: string): Promise<void> {
  await ctx.database.remove('pw_meta', { key })
}
