import { describe, expect, it } from 'vitest'

import { scoreTitle, searchUrlOf } from '../src/crawler/search'
import { describeInvalidId, extractItemId, isValidItemId } from '../src/util/itemId'

describe('isValidItemId：别把型号名/演示数据当商品 ID', () => {
  it('拼多多 / 京东 / 淘宝都要求纯数字', () => {
    expect(isValidItemId('pdd', '123456789012')).toBe(true)
    expect(isValidItemId('jd', '100012043978')).toBe(true)
    expect(isValidItemId('taobao', '678901234567')).toBe(true)
  })

  it('演示数据与型号名一律判否（这正是「商品不存在」的来源）', () => {
    expect(isValidItemId('pdd', 'pdd-gpu:rtx5090-32g')).toBe(false)
    expect(isValidItemId('pdd', '5070ti')).toBe(false)
    expect(isValidItemId('jd', 'mock-900007')).toBe(false)
    expect(isValidItemId('pdd', '')).toBe(false)
    expect(isValidItemId('pdd', undefined)).toBe(false)
  })

  it('人工录入/演示平台不限制形态', () => {
    expect(isValidItemId('manual', 'manual-1')).toBe(true)
    expect(isValidItemId('mock', 'anything')).toBe(true)
  })
})

describe('extractItemId：从链接里取 ID，取不到就返回 null', () => {
  it('从真实链接取', () => {
    expect(extractItemId('jd', 'https://item.jd.com/100012043978.html')).toBe('100012043978')
    expect(extractItemId('pdd', 'https://mobile.yangkeduo.com/goods.html?goods_id=123456789012')).toBe('123456789012')
    expect(extractItemId('taobao', 'https://item.taobao.com/item.htm?id=678901234567')).toBe('678901234567')
  })

  it('从型号名/假 ID 里取不到（不能瞎拼 URL）', () => {
    expect(extractItemId('pdd', 'pdd-gpu:rtx5090-32g')).toBe(null)
    expect(extractItemId('jd', 'mock-900007')).toBe(null)
  })

  it('不支持的平台给 null', () => {
    expect(extractItemId('pdd', '')).toBe(null)
  })
})

describe('describeInvalidId：提示里要说清该用什么形态', () => {
  it('给出数字示例', () => {
    expect(describeInvalidId('pdd', 'pdd-gpu:x')).toContain('纯数字')
    expect(describeInvalidId('pdd', 'pdd-gpu:x')).toContain('123456789012')
  })
})

describe('scoreTitle：型号靠数字区分', () => {
  it('数字全中的排前面', () => {
    const keyword = 'RTX 5070 Ti'
    const exact = scoreTitle(keyword, '七彩虹 RTX 5070 Ti 16G 显卡')
    const other = scoreTitle(keyword, '七彩虹 RTX 5080 16G 显卡')
    expect(exact).toBeGreaterThan(other)
    expect(exact).toBeGreaterThan(0.5)
  })

  it('完全不相关接近 0', () => {
    expect(scoreTitle('RTX 5070 Ti', '苹果 手机壳')).toBeLessThan(0.2)
  })

  it('空关键词返回 0', () => {
    expect(scoreTitle('', '任意标题')).toBe(0)
  })
})

describe('searchUrlOf', () => {
  it('三个平台都有搜索地址，未知平台返回 null', () => {
    expect(searchUrlOf('jd', '5070ti')).toContain('5070ti')
    expect(searchUrlOf('pdd', '5070ti')).toContain('search_result')
    expect(searchUrlOf('taobao', '5070ti')).toContain('s.m.taobao.com')
    expect(searchUrlOf('suning', '5070ti')).toBe(null)
  })
})
