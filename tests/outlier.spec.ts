import { describe, expect, it } from 'vitest'

import { priceOutlier } from '../src/domain/quote'

describe('priceOutlier：偏离历史中位数', () => {
  it('历史不足 3 个点不判断（冷启动不误杀）', () => {
    expect(priceOutlier([8000, 8100], 1150).outlier).toBe(false)
    expect(priceOutlier([], 1150).outlier).toBe(false)
  })

  it('正常波动（±30%）不算可疑', () => {
    expect(priceOutlier([8000, 8100, 8200], 7900).outlier).toBe(false)
  })

  it('跌到 1/7 会被拦下并给出理由', () => {
    const result = priceOutlier([8000, 8100, 8200], 1150)
    expect(result.outlier).toBe(true)
    expect(result.reason).toContain("中位价")
  })

  it('暴涨同样拦下（抓到天价/配件价）', () => {
    expect(priceOutlier([8000, 8100, 8200], 40000).outlier).toBe(true)
  })

  it('偶数个样本取中间两值平均', () => {
    const result = priceOutlier([7000, 8000, 9000, 10000], 8000)
    expect(result.median).toBe(8500)
    expect(result.outlier).toBe(false)
  })

  it('阈值可调：偏离 86% 在 90% 阈值内放行，在 50% 阈值内拦下', () => {
    expect(priceOutlier([8000, 8100, 8200], 1150, 0.9).outlier).toBe(false)
    expect(priceOutlier([8000, 8100, 8200], 1150, 0.5).outlier).toBe(true)
  })
})
