import { describe, expect, it } from 'vitest'

import { modelMatches } from '../src/domain/quote'

describe('modelMatches：防低价引流', () => {
  it('标题含目标型号则通过', () => {
    expect(modelMatches('RTX 5070 Ti 16G', '七彩虹 RTX 5070 Ti 16G 显卡').matches).toBe(true)
  })

  it('标题是 2060 而目标是 5070 → 拒绝（典型引流）', () => {
    const r = modelMatches('RTX 5070 Ti 16G', '特价 RTX 2060 6G 显卡 秒杀')
    expect(r.matches).toBe(false)
    expect(r.reason).toContain('疑似低价引流')
  })

  it('5070 标题但缺 ti → 拒绝（Ti 与非 Ti 是两个型号）', () => {
    expect(modelMatches('RTX 5070 Ti', 'RTX 5070 12G 显卡').matches).toBe(false)
  })

  it('大小写与空格不影响', () => {
    expect(modelMatches('rtx 5070 ti', 'RTX5070TI 显卡').matches).toBe(true)
  })

  it('目标是内存/固态等非显卡型号时不做代码校验', () => {
    expect(modelMatches('990 PRO 2TB', '三星 990 PRO 2TB NVMe').matches).toBe(true)
  })

  it('标题里多个型号只要含目标就通过', () => {
    expect(modelMatches('RTX 5070 Ti', 'RTX 5070 Ti / 5080 可选').matches).toBe(true)
  })
})
