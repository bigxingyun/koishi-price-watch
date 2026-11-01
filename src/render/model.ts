import { Context } from 'koishi'

import type { Category } from '../constants'
import { CATEGORY_LABEL, formatDay, issueNo, round, shiftDay, toDay } from '../constants'
import { computeLong, percentileRank, representativePrice } from '../analytics'
import type { Config } from '../index'
import type { PwModel, PwOffer, PwSnapshot } from '../store/model'
import * as repo from '../store/repo'

export const PLATFORM_LABEL: Record<string, string> = {
  jd: '京东',
  taobao: '淘宝',
  pdd: '拼多多',
  manual: '人工',
  mock: '演示',
}

/** 报表周期 */
export type ReportKind = 'daily' | 'weekly' | 'monthly'

/** 平台过滤：all 表示全平台 */
export type PlatformFilter = 'all' | string

export const REPORT_META: Record<ReportKind, { label: string; changeLabel: string; windowDays: number; title: string }> = {
  daily: { label: '本日', changeLabel: '单日', windowDays: 1, title: '硬件价格日报' },
  weekly: { label: '近 7 日', changeLabel: '本周', windowDays: 7, title: '硬件价格周报' },
  monthly: { label: '近 30 日', changeLabel: '本月', windowDays: 30, title: '硬件价格月报' },
}

export interface DigestOffer {
  platform: string
  label: string
  price: number | null
  /** 店铺名（品牌旗舰店 / 第三方店），报表里要显示 */
  shopName?: string
}

export interface DigestItem {
  modelId: string
  name: string
  category: Category
  /** 期末价（日报即现价） */
  price: number
  open: number
  high: number
  low: number
  /** 周期涨跌幅 */
  change: number
  /** 上一周期涨跌幅，用于「较上期」 */
  prevChange: number | null
  /** 最近一日涨跌 */
  d1: number
  /** 周期内区间位置 0~1 */
  pos: number
  streak: number
  label: string
  grade: string
  modifier: string
  confidence: string
  r30: number
  q30: number
  offers: DigestOffer[]
  trend: number[]
  degrade?: { kind: 'coldstart' | 'stale'; detail: string }
}

export interface DigestIndex {
  category: Category
  label: string
  value: number
  change: number
  prevChange: number | null
  q30: number
  zone: string
  r30: number
}

export interface CompareItem {
  name: string
  items: DigestOffer[]
  spread: number
  lowest: string
}

export interface PeriodInfo {
  kind: ReportKind
  label: string
  changeLabel: string
  title: string
  startDay: number
  endDay: number
  rangeText: string
  platform: PlatformFilter
  platformLabel: string
}

export interface DigestModel {
  day: number
  dateText: string
  issue: string
  period: PeriodInfo
  health: { total: number; ok: number; failed: number; note?: string }
  indexes: DigestIndex[]
  /** 全部型号（按价格降序），分品类出图时按 category 过滤 */
  items: DigestItem[]
  movers: DigestItem[]
  compare: CompareItem[]
  watch: DigestItem[]
  footer: { models: number; quotes: number; costMs: number }
  theme: 'newspaper' | 'marble' | 'pixel'
  colorScheme: 'cn' | 'intl'
}

export interface BuildOptions {
  kind?: ReportKind
  platform?: PlatformFilter
  day?: number
  topMovers?: number
  maxWatch?: number
  compareThreshold?: number
  watchIds?: string[]
  costMs?: number
}

function zoneOf(q30: number): string {
  if (q30 <= 0.2) return '低位'
  if (q30 <= 0.35) return '偏低'
  if (q30 < 0.65) return '常态'
  if (q30 < 0.8) return '偏高'
  return '高位'
}

function classifyPeriod(r: number): string {
  if (r >= 0.08) return '急涨'
  if (r >= 0.03) return '上涨'
  if (r > -0.03) return '横盘'
  if (r > -0.08) return '下跌'
  return '急跌'
}

/** 周期内连续同向天数（末段） */
function streakOf(points: Array<{ day: number; price: number }>): number {
  if (points.length < 2) return 0
  let streak = 0
  for (let i = points.length - 1; i > 0; i--) {
    const diff = points[i].price - points[i - 1].price
    if (diff === 0) break
    const sign = diff > 0 ? 1 : -1
    if (streak === 0) streak = sign
    else if (Math.sign(streak) === sign) streak += sign
    else break
  }
  return streak
}

interface WindowStats {
  open: number
  close: number
  change: number
  high: number
  low: number
  pos: number
}

function statsOf(points: Array<{ day: number; price: number }>, openOverride?: number): WindowStats {
  if (!points.length) return { open: 0, close: 0, change: 0, high: 0, low: 0, pos: 0.5 }
  const open = openOverride ?? points[0].price
  const close = points[points.length - 1].price
  const prices = points.map((p) => p.price)
  const high = Math.max(...prices)
  const low = Math.min(...prices)
  return {
    open,
    close,
    change: open ? close / open - 1 : 0,
    high,
    low,
    pos: high === low ? 0.5 : (close - low) / (high - low),
  }
}

/** 解析平台别名（中文/英文/简写都能认） */
export function parsePlatform(input?: string): PlatformFilter {
  if (!input) return 'all'
  const text = input.trim().toLowerCase()
  if (['jd', '京东', 'jingdong'].includes(text)) return 'jd'
  if (['taobao', 'tb', '淘宝', '天猫', 'tmall'].includes(text)) return 'taobao'
  if (['pdd', '拼多多', 'pinduoduo'].includes(text)) return 'pdd'
  if (['manual', '人工'].includes(text)) return 'manual'
  if (['all', '全部', '全平台', '所有'].includes(text)) return 'all'
  return text
}

/**
 * 组装报表数据模型。
 *
 * 相比早期版本的两个关键变化：
 * - `kind`：日报 / 周报 / 月报（滚动 1 / 7 / 30 日），周期语义贯穿所有字段
 * - `platform`：只看单个平台时，代表价只由该平台的报价聚合，比价段自动隐藏
 *
 * 指标全部在内存里按需计算（几十型号 × 百余天）。
 * 好处是「周期 × 平台」的组合天然成立，不必为每种组合预建聚合表；
 * `pw_daily` / `pw_stat` 仍然保留，给需要毫秒级响应的单型号查询用。
 */
export async function buildDigest(
  ctx: Context,
  config: Config,
  options: BuildOptions = {},
): Promise<DigestModel> {
  const started = Date.now()
  const kind = options.kind ?? 'daily'
  const platform = options.platform ?? 'all'
  const meta = REPORT_META[kind]
  const day = options.day ?? toDay()
  const windowDays = meta.windowDays
  const topMovers = options.topMovers ?? config.basic.topMovers
  const maxWatch = options.maxWatch ?? config.basic.maxWatchItems
  const threshold = options.compareThreshold ?? config.basic.compareThreshold

  const startDay = shiftDay(day, -(windowDays - 1))
  const prevEnd = shiftDay(startDay, -1)
  const prevStart = shiftDay(prevEnd, -(windowDays - 1))
  const lookback = shiftDay(prevStart, -31)

  const models = await repo.listModels(ctx)
  const offers = await repo.listOffers(ctx)
  const offerMap = new Map(offers.map((o) => [o.id, o as PwOffer]))
  const activeOffers = (platform === 'all' ? offers : offers.filter((o) => o.platform === platform))
    .filter((o) => o.active)

  const snapshots = await repo.getSnapshots(ctx, models.map((m) => m.id), lookback)

  // modelId → day → 该平台（或全平台）的价格集合
  const byModelDay = new Map<string, Map<number, number[]>>()
  for (const snap of snapshots) {
    if (snap.status !== 0 || !snap.price) continue
    const offer = offerMap.get(snap.offerId)
    if (!offer) continue
    if (platform !== 'all' && offer.platform !== platform) continue
    let byDay = byModelDay.get(snap.modelId)
    if (!byDay) byModelDay.set(snap.modelId, (byDay = new Map()))
    const list = byDay.get(snap.day) ?? []
    list.push(snap.price)
    byDay.set(snap.day, list)
  }

  const seriesByModel = new Map<string, Array<{ day: number; price: number }>>()
  for (const [modelId, byDay] of byModelDay) {
    const points = [...byDay.entries()]
      .map(([d, prices]) => ({ day: d, price: representativePrice(prices) }))
      .sort((a, b) => a.day - b.day)
    seriesByModel.set(modelId, points)
  }

  const inRange = (points: Array<{ day: number; price: number }>, from: number, to: number) =>
    points.filter((p) => p.day >= from && p.day <= to)

  // 每个型号每个平台最近一次价格（用于比价与「三平台报价」）
  const latestByPlatform = new Map<string, Map<string, { price: number; day: number; shop?: string }>>()
  for (const snap of snapshots) {
    const offer = offerMap.get(snap.offerId)
    if (!offer || snap.status !== 0 || !snap.price) continue
    if (snap.day < shiftDay(day, -3)) continue
    let map = latestByPlatform.get(snap.modelId)
    if (!map) latestByPlatform.set(snap.modelId, (map = new Map()))
    const prev = map.get(offer.platform)
    if (!prev || prev.day < snap.day) {
      map.set(offer.platform, { price: snap.price, day: snap.day, shop: offer.shopName })
    }
  }

  const PLATFORM_ORDER = ['jd', 'taobao', 'pdd']
  const offersOf = (modelId: string): DigestOffer[] => {
    const map = latestByPlatform.get(modelId)
    if (!map) return []
    const present = [...map.keys()]
    const ordered = [
      ...PLATFORM_ORDER.filter((p) => present.includes(p)),
      ...present.filter((p) => !PLATFORM_ORDER.includes(p)).sort(),
    ]
    return ordered.map((p) => ({
      platform: p,
      label: PLATFORM_LABEL[p] ?? p,
      price: map.get(p)!.price,
      shopName: map.get(p)!.shop,
    }))
  }

  const buildItem = (model: PwModel): DigestItem | null => {
    const points = seriesByModel.get(model.id) ?? []
    if (!points.length) return null
    const current = inRange(points, startDay, day)
    if (!current.length) return null
    const prev = inRange(points, prevStart, prevEnd)

    // 日报的窗口只有 1 天，期初必须取「窗口前最近一个点」，否则 open==close，涨跌恒为 0
    const before = points.filter((p) => p.day < startDay)
    const openPoint = current.length > 1 ? current[0] : (before[before.length - 1] ?? current[0])
    const stats = statsOf(current, openPoint.price)
    const prevStats = windowDays > 1 && prev.length ? statsOf(prev) : null
    const long = computeLong(points.slice(-30))
    const lastTwo = points.slice(-2)
    const d1 = lastTwo.length === 2 && lastTwo[0].price
      ? lastTwo[1].price / lastTwo[0].price - 1
      : 0

    return {
      modelId: model.id,
      name: model.name,
      category: model.category as Category,
      price: stats.close,
      open: stats.open,
      high: stats.high,
      low: stats.low,
      change: round(stats.change, 4),
      prevChange: prevStats ? round(prevStats.change, 4) : null,
      d1: round(d1, 4),
      pos: round(stats.pos, 4),
      streak: streakOf(current),
      label: classifyPeriod(stats.change),
      grade: long.grade,
      modifier: long.modifier,
      confidence: long.confidence,
      r30: long.r30,
      q30: long.q30,
      offers: offersOf(model.id),
      trend: current.slice(-30).map((p) => p.price),
      degrade: long.n30 < 21
        ? { kind: 'coldstart' as const, detail: `长期数据积累中 ${long.n30}/30 日` }
        : undefined,
    }
  }

  const allItems = models
    .map((m) => buildItem(m))
    .filter((x): x is DigestItem => x !== null)

  const movers = [...allItems]
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, topMovers)

  // 品类指数：等权几何平均，各型号以自身首采价为 100
  const indexes: DigestIndex[] = []
  for (const category of ['gpu', 'ram', 'ssd'] as Category[]) {
    const members = models.filter((m) => m.category === category && m.inIndex)
    if (!members.length) continue

    const levelAt = (targetDay: number): number | null => {
      const pairs: Array<{ base: number; current: number }> = []
      for (const m of members) {
        const points = seriesByModel.get(m.id) ?? []
        if (!points.length) continue
        let value: number | null = null
        for (const p of points) {
          if (p.day <= targetDay) value = p.price
          else break
        }
        if (value) pairs.push({ base: points[0].price, current: value })
      }
      if (!pairs.length) return null
      const sum = pairs.reduce((acc, p) => acc + Math.log(p.current / p.base), 0)
      return 100 * Math.exp(sum / pairs.length)
    }

    const closeLevel = levelAt(day)
    // 日报（窗口 1 天）用昨天的指数水平当基期，否则恒定 0%
    const openLevel = levelAt(windowDays === 1 ? prevEnd : startDay)
    if (!closeLevel || !openLevel) continue

    const prevClose = levelAt(prevEnd)
    const prevOpen = levelAt(prevStart)

    const history: number[] = []
    for (let i = 29; i >= 0; i--) {
      const level = levelAt(shiftDay(day, -i))
      if (level) history.push(level)
    }
    const q30 = percentileRank(closeLevel, history)
    const avg = history.reduce((a, b) => a + b, 0) / (history.length || 1)

    indexes.push({
      category,
      label: CATEGORY_LABEL[category],
      value: round(closeLevel, 2),
      change: round(closeLevel / openLevel - 1, 4),
      prevChange: prevClose && prevOpen ? round(prevClose / prevOpen - 1, 4) : null,
      q30: round(q30, 4),
      zone: zoneOf(q30),
      r30: avg ? round(closeLevel / avg - 1, 4) : 0,
    })
  }

  // 比价只在全平台模式下有意义
  const compare: CompareItem[] = []
  if (platform === 'all') {
    for (const item of allItems) {
      const prices = item.offers.filter((o) => o.price !== null) as Array<DigestOffer & { price: number }>
      if (prices.length < 2) continue
      const values = prices.map((o) => o.price)
      const min = Math.min(...values)
      const max = Math.max(...values)
      if (!min) continue
      const spread = max / min - 1
      if (spread < threshold) continue
      const lowest = prices.find((o) => o.price === min)!.label
      compare.push({ name: item.name, items: item.offers, spread: round(spread, 4), lowest })
    }
    compare.sort((a, b) => b.spread - a.spread)
  }

  const watch = (options.watchIds ?? [])
    .map((id) => allItems.find((i) => i.modelId === id))
    .filter((x): x is DigestItem => !!x)
    .slice(0, maxWatch)

  // 采集健康度：按窗口末日实际拿到数据的报价数算
  const lastDayByOffer = new Map<number, number>()
  for (const snap of snapshots) {
    if (snap.status !== 0) continue
    const prev = lastDayByOffer.get(snap.offerId) ?? 0
    if (snap.day > prev) lastDayByOffer.set(snap.offerId, snap.day)
  }
  const latestDay = lastDayByOffer.size ? Math.max(...lastDayByOffer.values()) : 0
  const okCount = activeOffers.filter((o) => lastDayByOffer.get(o.id) === latestDay).length

  const firstDayText = await repo.metaGet(ctx, 'firstDay')
  const baseDay = Number(firstDayText) || startDay
  const platformLabel = platform === 'all' ? '全平台' : (PLATFORM_LABEL[platform] ?? platform)
  const rangeText = windowDays === 1
    ? formatDay(day)
    : `${formatDay(startDay)} — ${formatDay(day)}`

  return {
    day,
    dateText: formatDay(day),
    issue: issueNo(day, baseDay),
    period: {
      kind,
      label: meta.label,
      changeLabel: meta.changeLabel,
      title: meta.title,
      startDay,
      endDay: day,
      rangeText,
      platform,
      platformLabel,
    },
    health: {
      total: activeOffers.length,
      ok: okCount,
      failed: Math.max(0, activeOffers.length - okCount),
    },
    indexes,
    items: [...allItems].sort((a, b) => b.price - a.price),
    movers,
    compare: compare.slice(0, 2),
    watch,
    footer: { models: models.length, quotes: okCount, costMs: options.costMs ?? Date.now() - started },
    theme: config.basic.theme,
    colorScheme: config.basic.colorScheme,
  }
}

/** 取某型号一段时间内的价格序列（trend 指令与单平台模式用） */
export async function seriesOf(
  ctx: Context,
  modelId: string,
  days: number,
  platform: PlatformFilter = 'all',
): Promise<number[]> {
  const today = toDay()
  const since = shiftDay(today, -(days - 1))
  const offers = (await repo.listOffers(ctx, modelId))
    .filter((o) => platform === 'all' || o.platform === platform)
  const offerIds = new Set(offers.map((o) => o.id))
  const snapshots = await repo.getSnapshots(ctx, [modelId], since) as PwSnapshot[]
  const byDay = new Map<number, number[]>()
  for (const snap of snapshots) {
    if (snap.status !== 0 || !snap.price) continue
    if (!offerIds.has(snap.offerId)) continue
    const list = byDay.get(snap.day) ?? []
    list.push(snap.price)
    byDay.set(snap.day, list)
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, prices]) => representativePrice(prices))
}
