import type { Context } from 'koishi'

import { STATUS, toCents } from '../constants'
import { AuthError, ParseError, type Quote } from '../crawler/types'

/**
 * 统一数据契约（L0 领域层）。
 *
 * 为什么要有它：适配器各自抛错、各自返回 note，导致「为什么没拿到价」永远说不清。
 * 现在所有采集路径都收敛成这一个结构，**失败原因只有一个表述方式**。
 *
 * 依赖方向：领域层不 import 任何上层（services / commands / render）。
 */

export type QuoteStatus =
  | 'ok'
  | 'out_of_stock'
  | 'delisted'
  | 'auth_required'
  | 'blocked'
  | 'parse_failed'
  | 'suspicious'

export type QuoteSource = 'api' | 'browser' | 'manual' | 'mock'

export interface QuoteResult {
  ok: boolean
  /** 到手价（元，两位小数）；失败时无 */
  price?: number
  listPrice?: number
  shopName?: string
  title?: string
  status: QuoteStatus
  source: QuoteSource
  /** 给人看的一句话原因；成功时留空 */
  reason?: string
  /** 排查证据：接口名 / 页面 URL / 正则命中位置 */
  evidence?: string
  /** 耗时（毫秒） */
  costMs?: number
}

export const PRICE_FLOOR_YUAN = 1
export const PRICE_CEIL_YUAN = 200_000

/** 价格本身是否像一个正常价格（不合法就绝不入库） */
export function priceLooksSane(priceYuan: number): boolean {
  if (!Number.isFinite(priceYuan)) return false
  if (priceYuan < PRICE_FLOOR_YUAN || priceYuan > PRICE_CEIL_YUAN) return false
  // 12 位以上的数字通常是 ID 被误当价格
  return priceYuan < 1e9
}

/** 失败状态 → 数据库里的 status 数字 */
export function statusCodeOf(status: QuoteStatus): number {
  switch (status) {
    case 'ok':
      return STATUS.OK
    case 'out_of_stock':
      return STATUS.OUT_OF_STOCK
    case 'delisted':
      return STATUS.DELISTED
    case 'suspicious':
      return STATUS.SUSPICIOUS
    default:
      return STATUS.FAILED
  }
}

/**
 * 异常 → 统一状态。这是「一眼看出为什么失败」的核心：
 * 任何适配器只要按约定抛这三种错，这里就会给出确定的分类。
 */
export function classifyError(error: unknown): { status: QuoteStatus; reason: string } {
  const message = (error as Error)?.message ?? String(error)
  if (error instanceof AuthError) return { status: 'auth_required', reason: message }
  if (error instanceof ParseError) return { status: 'parse_failed', reason: message }
  if (/风控|blocked|封|验证码|captcha|403/i.test(message)) return { status: 'blocked', reason: message }
  if (/timeout|ETIMEDOUT|ECONNRESET|网络/i.test(message)) return { status: 'parse_failed', reason: `网络失败：${message}` }
  return { status: 'parse_failed', reason: message }
}

/** 把适配器返回的 Quote（分）转成领域层的 QuoteResult（元） */
export function fromQuote(quote: Quote, source: QuoteSource, costMs?: number): QuoteResult {
  const priceYuan = quote.price / 100
  const statusMap: Record<number, QuoteStatus> = {
    [STATUS.OK]: 'ok',
    [STATUS.OUT_OF_STOCK]: 'out_of_stock',
    [STATUS.DELISTED]: 'delisted',
    [STATUS.SUSPICIOUS]: 'suspicious',
    [STATUS.FAILED]: 'parse_failed',
  }
  const status = statusMap[quote.status] ?? 'parse_failed'

  if (status === 'ok' && !priceLooksSane(priceYuan)) {
    return {
      ok: false,
      status: 'suspicious',
      source,
      costMs,
      reason: `价格不合理（${priceYuan} 元），已拦下不入库`,
      evidence: quote.note,
    }
  }

  return {
    ok: status === 'ok',
    price: status === 'ok' ? Number(priceYuan.toFixed(2)) : undefined,
    listPrice: quote.listPrice ? Number((quote.listPrice / 100).toFixed(2)) : undefined,
    status,
    source,
    reason: status === 'ok' ? undefined : quote.note,
    evidence: quote.note,
    costMs,
  }
}

/** 成功结果 → 写库用的行（唯一出口，避免各处自己算分） */
export function toSnapshotRow(result: QuoteResult, offerId: number, modelId: string, day: number) {
  return {
    offerId,
    modelId,
    day,
    price: result.ok && result.price ? toCents(result.price) : 0,
    listPrice: result.listPrice ? toCents(result.listPrice) : 0,
    status: statusCodeOf(result.status),
    samples: 1,
  }
}

/** 无副作用的诊断行，用于日志与自检 */
export function describeResult(result: QuoteResult): string {
  const where = result.source
  if (result.ok) return `${where} 成功 ¥${result.price?.toFixed(0) ?? '?'}`
  return `${where} 失败[${result.status}] ${result.reason ?? ''}`
}

export type { Context }

/**
 * 价格是否异常偏离历史中位数。
 *
 * 质量闸门原来只拦 0 元和天文数字，但「8999 的卡突然变 1150」这类明显错误
 * （抓到了分期/优惠/配件价）会当成真价格写进报表，所以补一次相对判断。
 *   - 历史不足 3 个点：不判断（避免冷启动误杀）
 *   - 偏离超过阈值：标记可疑，采集层不入库
 */
export interface OutlierCheck {
  outlier: boolean
  median: number
  deviation: number
  reason?: string
}

export function priceOutlier(history: number[], priceYuan: number, threshold = 0.6): OutlierCheck {
  const clean = history.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (clean.length < 3) return { outlier: false, median: 0, deviation: 0 }

  const mid = Math.floor(clean.length / 2)
  const median = clean.length % 2 ? clean[mid]! : (clean[mid - 1]! + clean[mid]!) / 2
  if (!median) return { outlier: false, median: 0, deviation: 0 }

  const deviation = (priceYuan - median) / median
  if (Math.abs(deviation) <= threshold) return { outlier: false, median, deviation }

  const sign = deviation > 0 ? "+" : ""
  const percent = sign + (deviation * 100).toFixed(0) + "%"
  return {
    outlier: true,
    median,
    deviation,
    reason: "本次 " + priceYuan + " 元偏离最近中位价 " + Math.round(median) + " 元（" + percent + "），超出 " + (threshold * 100) + "% 阈值",
  }
}

// ── 型号一致性（防低价引流） ─────────────────────

/**
 * 商家常用套路：标题写「RTX 5070」，实际 SKU 是 2060/3060，用低价把你骗进去。
 * 这里从标题里抽出型号代号，和目标型号比对，不一致就拒绝入库。
 */
export interface ModelMatch {
  matches: boolean
  expected: string
  found: string[]
  reason?: string
}

const CODE_RE = /\b(?:rtx|gtx|rx|arc)?\s*(\d{4})\s*(ti|super|xt|xtx|gre)?\b/gi

function codesOf(text: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(CODE_RE.source, "gi")
  while ((m = re.exec(text))) {
    const num = m[1]
    const suffix = (m[2] || "").toLowerCase()
    if (!num) continue
    out.push(suffix ? num + suffix : num)
  }
  return out
}

export function modelMatches(expectedName: string, actualText: string): ModelMatch {
  const expectedCodes = codesOf(expectedName)
  const actualCodes = codesOf(actualText)
  if (!expectedCodes.length) return { matches: true, expected: expectedName, found: actualCodes }

  // 目标型号的每个代号都必须出现在标题里（5070ti 要求 ti 也在）
  const missing = expectedCodes.filter((code) => !actualCodes.includes(code))
  if (!missing.length) return { matches: true, expected: expectedName, found: actualCodes }

  return {
    matches: false,
    expected: expectedName,
    found: actualCodes,
    reason: "页面标题是 " + actualCodes.slice(0, 3).join("/") + "，与目标 " + expectedCodes.join("/") + " 不符（疑似低价引流）",
  }
}
