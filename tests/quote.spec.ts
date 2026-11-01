import { describe, expect, it } from 'vitest'

import { STATUS } from '../src/constants'
import { AuthError, ParseError } from '../src/crawler/types'
import {
  classifyError,
  fromQuote,
  priceLooksSane,
  statusCodeOf,
  toSnapshotRow,
} from '../src/domain/quote'

/**
 * L0 领域层边界测试：不联网、不碰数据库。
 * 这些用例保证「同样的失败，永远得到同一个分类与同一句话」。
 */

describe('priceLooksSane：脏数据进不了库', () => {
  it('正常价格通过', () => {
    expect(priceLooksSane(5999)).toBe(true)
    expect(priceLooksSane(1)).toBe(true)
    expect(priceLooksSane(199999)).toBe(true)
  })

  it('异常价格拦下', () => {
    expect(priceLooksSane(0)).toBe(false)
    expect(priceLooksSane(-5)).toBe(false)
    expect(priceLooksSane(0.5)).toBe(false)
    expect(priceLooksSane(NaN)).toBe(false)
    expect(priceLooksSane(1e9)).toBe(false)
  })
})

describe('classifyError：失败原因只有一套说法', () => {
  it('登录失效 → auth_required', () => {
    expect(classifyError(new AuthError('京东要求登录')).status).toBe('auth_required')
  })

  it('解析失败 → parse_failed', () => {
    expect(classifyError(new ParseError('没找到价格')).status).toBe('parse_failed')
  })

  it('风控 → blocked', () => {
    expect(classifyError(new Error('被风控拦截')).status).toBe('blocked')
    expect(classifyError(new Error('captcha required')).status).toBe('blocked')
  })

  it('网络错误带上「网络失败」前缀', () => {
    const result = classifyError(new Error('timeout of 30000ms exceeded'))
    expect(result.status).toBe('parse_failed')
    expect(result.reason).toContain('网络失败')
  })

  it('未知错误也归类为 parse_failed，并保留原文', () => {
    const result = classifyError(new Error('something odd'))
    expect(result.status).toBe('parse_failed')
    expect(result.reason).toBe('something odd')
  })
})

describe('fromQuote：分 → 元，并做质量闸门', () => {
  it('成功结果换算成元', () => {
    const result = fromQuote({ price: 556500, status: STATUS.OK, note: 'browser' }, 'browser', 120)
    expect(result.ok).toBe(true)
    expect(result.price).toBe(5565)
    expect(result.costMs).toBe(120)
  })

  it('可疑价格被拦下，不入库', () => {
    const result = fromQuote({ price: 12, status: STATUS.OK }, 'browser')
    expect(result.ok).toBe(false)
    expect(result.status).toBe('suspicious')
    expect(result.price).toBeUndefined()
  })

  it('缺货/下架保留状态', () => {
    expect(fromQuote({ price: 0, status: STATUS.OUT_OF_STOCK }, 'browser').status).toBe('out_of_stock')
    expect(fromQuote({ price: 0, status: STATUS.DELISTED }, 'browser').status).toBe('delisted')
  })
})

describe('statusCodeOf / toSnapshotRow：写库只有一个出口', () => {
  it('状态映射到数据库数字', () => {
    expect(statusCodeOf('ok')).toBe(STATUS.OK)
    expect(statusCodeOf('auth_required')).toBe(STATUS.FAILED)
    expect(statusCodeOf('delisted')).toBe(STATUS.DELISTED)
  })

  it('成功行写入分，失败行写 0', () => {
    const ok = toSnapshotRow({ ok: true, price: 5999, status: 'ok', source: 'browser' }, 1, 'gpu:x', 20261101)
    expect(ok.price).toBe(599900)
    expect(ok.status).toBe(STATUS.OK)
    const bad = toSnapshotRow({ ok: false, status: 'parse_failed', source: 'browser' }, 1, 'gpu:x', 20261101)
    expect(bad.price).toBe(0)
    expect(bad.status).toBe(STATUS.FAILED)
  })
})
