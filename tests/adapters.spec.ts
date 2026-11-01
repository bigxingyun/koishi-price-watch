import { describe, expect, it } from 'vitest'

import { extractItemId } from '../src/util/itemId'
import { mockPriceFor } from '../src/adapters/mock'

describe('extractItemId', () => {
  it('从京东链接取 skuId', () => {
    expect(extractItemId('jd', 'https://item.jd.com/100012043978.html')).toBe('100012043978')
    expect(extractItemId('jd', 'https://item.m.jd.com/product/100046847201.html')).toBe('100046847201')
    expect(extractItemId('jd', '100012043978')).toBe('100012043978')
  })

  it('从淘宝链接取 id 参数', () => {
    expect(extractItemId('taobao', 'https://item.taobao.com/item.htm?id=678901234567')).toBe('678901234567')
  })

  it('解析不出时返回 null', () => {
    expect(extractItemId('jd', 'https://example.com/product')).toBeNull()
  })
})

describe('mockPriceFor', () => {
  it('同一天同一商品结果稳定（保证幂等可测）', () => {
    expect(mockPriceFor('jd-a', 20260101)).toBe(mockPriceFor('jd-a', 20260101))
  })

  it('不同天价格会变（保证趋势可测）', () => {
    const values = new Set([20260101, 20260102, 20260103, 20260104].map((d) => mockPriceFor('jd-a', d)))
    expect(values.size).toBeGreaterThan(1)
  })
})
