import type { Context } from 'koishi'

import type { Config } from '../index'
import { apiPrice } from '../api'
import { resolveSource } from '../collect/source'
import { getAdapter } from '../adapters'
import { buildValueRows } from '../render/image'
import type { PwModel, PwOffer } from '../store/model'
import { classifyError, fromQuote, priceLooksSane, type QuoteResult, type QuoteSource } from '../domain/quote'

/**
 * 采集一个报价（L3 服务层，唯一入口）。
 *
 * 这里做三件事，且只做这三件：
 *   1. 决定数据源（api / browser / manual）—— 调 source 的策略
 *   2. 调对应提供者 —— api 走联盟，browser 走适配器
 *   3. 把一切结果/异常收敛成 QuoteResult（含 reason / evidence / 耗时）
 *
 * 上层（collect 循环、指令、自检）只看 QuoteResult，不再自己判错。
 */

export interface CollectOneInput {
  ctx: Context
  config: Config
  offer: PwOffer
  model: PwModel
  day: number
}

export async function collectOne(input: CollectOneInput): Promise<QuoteResult> {
  const { ctx, config, offer, model, day } = input
  const platform = offer.platform
  const started = Date.now()

  const decision = await resolveSource(ctx, config, platform)
  if (decision.source === 'manual') {
    return {
      ok: false,
      status: 'parse_failed',
      source: 'manual',
      reason: `人工模式不采集（${decision.reason}）`,
      costMs: 0,
    }
  }

  if (decision.source === 'api') {
    const outcome = await apiPrice(ctx, config, platform, offer.itemId)
    if (!outcome.ok || !outcome.price) {
      return {
        ok: false,
        status: 'parse_failed',
        source: 'api',
        reason: outcome.message,
        evidence: decision.reason,
        costMs: Date.now() - started,
      }
    }
    // API 返回的价格同样要过质量闸门（联盟接口也会给出 0.01 这种占位价）
    if (!priceLooksSane(outcome.price.price)) {
      return {
        ok: false,
        status: 'suspicious',
        source: 'api',
        reason: `API 返回的价格不合理（${outcome.price.price} 元），已拦下`,
        evidence: outcome.price.note,
        costMs: Date.now() - started,
      }
    }
    return {
      ok: true,
      price: Number(outcome.price.price.toFixed(2)),
      status: 'ok',
      source: 'api',
      shopName: outcome.price.shopName,
      title: outcome.price.title,
      evidence: outcome.price.note,
      costMs: Date.now() - started,
    }
  }

  const adapter = getAdapter(platform)
  if (!adapter) {
    return {
      ok: false,
      status: 'parse_failed',
      source: 'browser',
      reason: `平台 ${platform} 没有适配器`,
      costMs: Date.now() - started,
    }
  }

  try {
    const quote = await adapter.fetch({ ctx, config, offer, model, day })
    return fromQuote(quote, 'browser', Date.now() - started)
  } catch (error) {
    const { status, reason } = classifyError(error)
    return {
      ok: false,
      status,
      source: 'browser',
      reason,
      evidence: decision.reason,
      costMs: Date.now() - started,
    }
  }
}

export type { QuoteResult, QuoteSource }
