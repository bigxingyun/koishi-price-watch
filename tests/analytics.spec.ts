import { describe, expect, it } from 'vitest'

import {
  categoryIndex,
  computeLong,
  computeShort,
  percentileRank,
  representativePrice,
  theilSen,
} from '../src/analytics'
import type { PricePoint } from '../src/analytics'

/** 造一条从 start 开始、每天 +step 的序列（day 用 20260101 起的连续日期） */
function series(prices: number[], start = 20260101): PricePoint[] {
  return prices.map((price, i) => ({ day: start + i, price }))
}

describe('theilSen', () => {
  it('完美直线给出精确斜率', () => {
    const xs = [0, 1, 2, 3, 4]
    const ys = [10, 12, 14, 16, 18]
    expect(theilSen(xs, ys)).toBeCloseTo(2, 6)
  })

  it('单个离群点不会带偏斜率（这就是不用最小二乘的理由）', () => {
    const xs = [0, 1, 2, 3, 4]
    const ys = [10, 12, 999, 16, 18]
    // 最小二乘会被 999 拉爆；中位斜率依然接近 2
    expect(theilSen(xs, ys)).toBeGreaterThan(0)
    expect(theilSen(xs, ys)).toBeLessThan(4)
  })

  it('点数不足时返回 0', () => {
    expect(theilSen([0], [5])).toBe(0)
  })
})

describe('percentileRank', () => {
  it('最高价分位为 1，最低价为 0.5/(n-1)（并列价各占一半，不把极端值推满）', () => {
    const history = [100, 101, 102, 103, 104]
    expect(percentileRank(104, history)).toBeCloseTo(1, 6)
    // 最低价与自身并列 1 个，按 (below + equal/2)/(n-1) = 0.125
    expect(percentileRank(100, history)).toBeCloseTo(0.125, 6)
  })

  it('样本不足时退回 0.5', () => {
    expect(percentileRank(100, [100])).toBe(0.5)
  })
})

describe('computeShort（STS 7 日）', () => {
  it('稳定上涨 10% 判为急涨，r7 精确', () => {
    const points = series([1000, 1000, 1000, 1000, 1000, 1000, 1050, 1100])
    const result = computeShort(points)
    expect(result.mode).toBe('full')
    expect(result.r7).toBeCloseTo(0.1, 4)
    expect(result.label).toBe('急涨')
    expect(result.pos7).toBeCloseTo(1, 4)
  })

  it('连续下跌时 streak 为负；跌幅 ≥8% 判急跌', () => {
    // 7 日基准取「距今 ≥6 天」的点：1100 → 960，跌幅 -12.7%
    const points = series([1100, 1080, 1060, 1040, 1020, 1000, 980, 960])
    const result = computeShort(points)
    expect(result.streak).toBeLessThan(0)
    expect(result.label).toBe('急跌')
  })

  it('只有 3 天数据时降级为「累计变化」，不出 7 日标签', () => {
    const result = computeShort(series([1000, 1010, 1050]))
    expect(result.mode).toBe('accumulated')
    expect(result.r7).toBeNull()
    expect(result.label).toBe('样本不足')
    expect(result.accumulated).toBeCloseTo(0.05, 4)
  })
})

describe('computeLong（LPRS 30 日）', () => {
  it('30 天恒定价格：横盘、常态、置信度高', () => {
    const result = computeLong(series(Array.from({ length: 30 }, () => 1000)))
    expect(result.available).toBe(true)
    expect(result.n30).toBe(30)
    expect(result.modifier).toBe('→')
    expect(result.grade).toBe('B')
    expect(result.confidence).toBe('高')
    expect(result.r30).toBeCloseTo(0, 6)
  })

  it('样本不足 21 天时 available=false（但仍在算，供 UI 标注估算）', () => {
    const result = computeLong(series(Array.from({ length: 10 }, (_, i) => 1000 + i)))
    expect(result.available).toBe(false)
    expect(result.n30).toBe(10)
    expect(result.confidence).toBe('低')
  })

  it('跌到区间底部时评级为 S 或 A', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 1200 - i * 5)
    const result = computeLong(series(prices))
    expect(result.q30).toBeLessThan(0.2)
    expect(['S', 'A']).toContain(result.grade)
    expect(result.modifier).toBe('↓↓')
  })

  it('涨到区间顶部且仍在涨时评级为 D', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 1000 + i * 10)
    const result = computeLong(series(prices))
    expect(result.q30).toBeGreaterThan(0.8)
    expect(result.grade).toBe('D')
  })
})

describe('categoryIndex', () => {
  it('两个型号都涨 10% 时指数为 110', () => {
    expect(categoryIndex([{ base: 1000, current: 1100 }, { base: 2000, current: 2200 }])).toBeCloseTo(110, 2)
  })

  it('一个涨一个跌时不被高价型号带偏（几何平均）', () => {
    const index = categoryIndex([{ base: 20000, current: 22000 }, { base: 500, current: 450 }])
    // 算术平均会给出 >100，几何平均给出 ≈ 100
    expect(index).toBeGreaterThan(95)
    expect(index).toBeLessThan(105)
  })
})

describe('representativePrice', () => {
  it('3 个价格用截尾均值，抹掉极端值', () => {
    expect(representativePrice([1000, 1100, 5000])).toBe(1100)
  })

  it('2 个价格取中位数', () => {
    expect(representativePrice([1000, 1200])).toBe(1100)
  })
})
