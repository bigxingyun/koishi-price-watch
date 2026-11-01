import { STATUS } from '../constants'
import { isSanePrice } from '../crawler/normalize'
import type { Adapter, AdapterJob, Quote } from '../crawler/types'

/**
 * Mock 适配器：不在网络上下任何请求，用于验证「调度 → 守卫 → 归一化 → 落库 → 聚合 → 渲染」整条链路。
 *
 * 价格由 (itemId, day) 哈希决定，因此：
 * - 同一天重复采集结果一致（可测幂等）
 * - 跨天自然变化（可测趋势）
 * - 完全离线（可在 CI 里跑）
 */

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 生成一个稳定的价格（分）。
 *
 * 关键：同一型号的多个平台必须共享基准价，只叠加 ±3% 的平台偏移。
 * 否则各平台基准价相差数倍，一旦某天某个平台缺货，「代表价」就会剧烈跳动，
 * 指标全被假波动污染（这是第一版踩到的坑）。
 */
export function mockPriceFor(itemId: string, day: number, modelId?: string): number {
  const anchor = modelId ?? itemId
  const base = 10_000 + (hash(anchor) % 290_000)
  const platformOffset = 0.97 + (hash(itemId) % 61) / 1000   // 0.970 ~ 1.030
  // 用「距固定纪元的天数」做平滑相位，避免 day 数值在月末跳变导致的假突刺
  const serial = Math.floor((dayToSerial(day)) / 1)
  const wave = Math.sin((serial % 97) / 97 * Math.PI * 2) * 0.03
  const drift = ((serial % 365) / 365 - 0.5) * 0.04
  return Math.max(100, Math.round(base * platformOffset * (1 + wave + drift)))
}

/** YYYYMMDD → 连续日序号（跨月/跨年连续，用于平滑波动） */
function dayToSerial(day: number): number {
  const year = Math.floor(day / 10000)
  const month = Math.floor(day / 100) % 100
  const date = day % 100
  return Math.floor(Date.UTC(year, month - 1, date) / 86_400_000)
}

export const mockAdapter: Adapter = {
  platform: 'mock',

  async fetch(job: AdapterJob): Promise<Quote> {
    const price = mockPriceFor(job.offer.itemId, job.day, job.offer.modelId)
    if (!isSanePrice(price)) {
      return { price: 0, status: STATUS.FAILED, note: 'mock 生成了不可信价格' }
    }
    // 2% 概率模拟缺货，用来验证「缺货不参与代表价」
    if (hash(`${job.offer.itemId}:${job.day}:stock`) % 100 < 2) {
      return { price, status: STATUS.OUT_OF_STOCK, note: 'mock 缺货' }
    }
    return { price, status: STATUS.OK, note: 'mock' }
  },
}
