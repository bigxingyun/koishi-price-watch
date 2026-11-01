import { describe, expect, it } from 'vitest'

import {
  isSanePrice,
  isSuspicious,
  looksLikeAuthWall,
  looksLikeDelisted,
  parsePrice,
} from '../src/crawler/normalize'

describe('parsePrice', () => {
  it('解析带货币符号与千分位的价格', () => {
    expect(parsePrice('¥6,299.00')).toBe(629900)
    expect(parsePrice('￥ 1299.9')).toBe(129990)
    expect(parsePrice('6299元')).toBe(629900)
  })

  it('纯数字按元处理', () => {
    expect(parsePrice('6299')).toBe(629900)
    expect(parsePrice(6299)).toBe(629900)
  })

  it('京东的混淆价必须判死，绝不能把 3??9 读成 39', () => {
    expect(parsePrice('3??9')).toBeNull()
    expect(parsePrice('1??9')).toBeNull()
    expect(parsePrice('4?')).toBeNull()
    expect(parsePrice('１？９')).toBeNull()
  })

  it('无货/占位文本返回 null', () => {
    expect(parsePrice('暂无报价')).toBeNull()
    expect(parsePrice('该商品已售罄')).toBeNull()
    expect(parsePrice('')).toBeNull()
    expect(parsePrice(null)).toBeNull()
    expect(parsePrice(undefined)).toBeNull()
  })

  it('0 与负数不算有效价格', () => {
    expect(parsePrice('0')).toBeNull()
    expect(parsePrice(-5)).toBeNull()
  })
})

describe('isSanePrice', () => {
  it('1 元 ~ 10 万元之间算合理', () => {
    expect(isSanePrice(100)).toBe(true)
    expect(isSanePrice(9_999_900)).toBe(true)
    expect(isSanePrice(99)).toBe(false)
    expect(isSanePrice(10_000_100)).toBe(false)
  })
})

describe('isSuspicious', () => {
  it('偏离参考价 50% 以上判为异常', () => {
    expect(isSuspicious(1000, 1050)).toBe(false)
    expect(isSuspicious(400, 1050)).toBe(true)
  })

  it('没有参考价时不判异常', () => {
    expect(isSuspicious(400)).toBe(false)
  })
})

describe('页面特征识别', () => {
  it('识别登录/验证墙', () => {
    expect(looksLikeAuthWall('<div>请先登录</div>')).toBe(true)
    expect(looksLikeAuthWall('请按住滑块拖动')).toBe(true)
    expect(looksLikeAuthWall('纯价格页面 6299')).toBe(false)
  })

  it('识别下架页', () => {
    expect(looksLikeDelisted('该商品已下架')).toBe(true)
    expect(looksLikeDelisted('商品正常在售')).toBe(false)
  })
})
