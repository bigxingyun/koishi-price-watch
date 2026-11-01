import type { Context } from 'koishi'

import type { Config } from '../index'
import { STATUS, toCents, toDay } from '../constants'
import { priceLooksSane, priceOutlier } from '../domain/quote'
import { rebuildAll } from '../store/aggregate'
import * as repo from '../store/repo'

/**
 * 外部数据接入（给用户自己的爬虫用）。
 *
 * 设计目标：用户不必改插件代码，只要按约定格式 POST 一份 JSON 过来，
 * 数据就会经过同一套清洗规则写进库里，报表立刻能用。
 *
 * 接入方式两种：
 *   1. HTTP：POST /price-watch/ingest（需要 ingest.token）
 *   2. 指令：价格 管理 导入 <JSON>（仅主人）
 *
 * 无论哪种，都要过三道清洗：价格合理性 → 偏离中位数 → 字段完整性。
 */

export interface IngestQuote {
  /** 平台：jd / pdd / taobao / manual */
  platform: string
  /** 型号名（会先按名字匹配型号库，匹配不到就新建） */
  model: string
  /** 价格（元，不是分） */
  price: number
  /** 商品 ID（可选，用于绑定/去重） */
  itemId?: string
  /** 商品标题（可选，用于型号校验） */
  title?: string
  /** 店铺名（可选） */
  shopName?: string
  /** 商品链接（可选） */
  url?: string
  /** 列表价/原价（可选） */
  listPrice?: number
  /** 数据日期 YYYYMMDD（可选，默认今天） */
  day?: number
  /** 稀有字段：抓取来源说明，会写进备注 */
  note?: string
}

export interface IngestPayload {
  token?: string
  source?: string
  quotes: IngestQuote[]
}

export interface IngestResult {
  accepted: number
  rejected: Array<{ index: number; reason: string }>
  day: number
}

const PLATFORMS = new Set(['jd', 'pdd', 'taobao', 'manual'])

function guessCategory(model: string): 'gpu' | 'ram' | 'ssd' {
  const name = model.toLowerCase()
  if (/ddr|内存|ram/.test(name)) return 'ram'
  if (/ssd|nvme|固态|tb|990|850x|p44|sn\d/.test(name)) return 'ssd'
  return 'gpu'
}

export async function ingestQuotes(
  ctx: Context,
  config: Config,
  payload: IngestPayload,
): Promise<IngestResult> {
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : []
  const rejected: IngestResult['rejected'] = []
  let accepted = 0
  const touched = new Set<string>()
  const source = (payload.source || '外部接入').slice(0, 24)

  for (let index = 0; index < quotes.length; index++) {
    const quote = quotes[index]!
    try {
      const platform = String(quote.platform || '').toLowerCase()
      if (!PLATFORMS.has(platform)) {
        rejected.push({ index, reason: `不认识的平台「${quote.platform}」` })
        continue
      }

      const modelName = String(quote.model || '').trim()
      if (modelName.length < 2) {
        rejected.push({ index, reason: '型号名为空' })
        continue
      }

      const price = Number(quote.price)
      if (!Number.isFinite(price) || !priceLooksSane(price)) {
        rejected.push({ index, reason: `价格不合理（${quote.price}）` })
        continue
      }

      const day = Number(quote.day) || toDay()

      // 找型号；没有就建一个（外部数据常常带新型号）
      const matches = await repo.searchModels(ctx, modelName, 1)
      let model: Awaited<ReturnType<typeof repo.getModel>> | undefined = matches[0]?.model
      if (!model) {
        const id = `${guessCategory(modelName)}-${Buffer.from(modelName).toString('hex').slice(0, 12)}`
        await repo.upsertModel(ctx, {
          id,
          name: modelName,
          category: guessCategory(modelName),
          brand: '',
          spec: '',
          aliases: [],
        } as never)
        model = await repo.getModel(ctx, id)
      }
      if (!model) {
        rejected.push({ index, reason: '型号创建失败' })
        continue
      }

      // 偏离历史中位数 → 标可疑，不入正常价
      const history = await repo.getRecentSnapshots(ctx, day - 30)
      const modelId = model.id
      const past = history.filter((s) => s.modelId === modelId && s.status === STATUS.OK).map((s) => s.price / 100)
      const outlier = priceOutlier(past, price)
      if (outlier.outlier) {
        rejected.push({ index, reason: outlier.reason ?? '价格偏离历史中位数' })
        continue
      }

      // 绑到报价（同一型号+平台，一个就够）
      let offers = await repo.listOffers(ctx, modelId)
      let offer = offers.find((o) => o.platform === platform)
      if (!offer) {
        await repo.upsertOffer(ctx, {
          modelId: model.id,
          platform,
          shopId: '',
          shopName: String(quote.shopName || '').slice(0, 40),
          itemId: String(quote.itemId || `${platform}-${Date.now()}`),
          url: String(quote.url || ''),
          title: String(quote.title || model.name).slice(0, 120),
          active: true,
        })
        offers = await repo.listOffers(ctx, modelId)
        offer = offers.find((o) => o.platform === platform)
      }
      if (!offer) {
        rejected.push({ index, reason: '报价创建失败' })
        continue
      }

      await repo.upsertSnapshot(ctx, {
        offerId: offer.id,
        modelId,
        day,
        price: toCents(price),
        listPrice: toCents(Number(quote.listPrice) || price),
        status: STATUS.OK,
        samples: 1,
      })
      await repo.metaSet(ctx, `ingest:${platform}`, JSON.stringify({ at: Date.now(), source })).catch(() => undefined)
      touched.add(modelId)
      accepted++
    } catch (error) {
      rejected.push({ index, reason: (error as Error).message.slice(0, 60) })
    }
  }

  if (touched.size) await rebuildAll(ctx, [...touched])
  return { accepted, rejected, day: toDay() }
}

/** 返回给调用方的摘要文本（HTTP 与指令共用） */
export function describeIngest(result: IngestResult, source?: string): string {
  const lines = [`导入完成：接受 ${result.accepted} 条${source ? `（来源 ${source}）` : ''}`]
  if (result.rejected.length) {
    lines.push('被拒：')
    for (const item of result.rejected.slice(0, 5)) lines.push(`  · 第 ${item.index + 1} 条：${item.reason}`)
    if (result.rejected.length > 5) lines.push(`  · 其余 ${result.rejected.length - 5} 条同类原因`)
  }
  lines.push('', '数据已写入并能出报表：价格 日报')
  return lines.join('\n')
}
