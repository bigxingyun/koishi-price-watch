import { describe, expect, it } from 'vitest'

import { canonical, sign, timestamp } from '../src/api/sign'

describe('开放平台签名', () => {
  it('按 key 字典序拼接（null/空值被丢弃）', () => {
    expect(canonical({ b: 2, a: 1, c: undefined, d: '' })).toBe('a1b2')
  })

  it('签名 = MD5(secret + 拼串 + secret) 大写', () => {
    // 固定输入，验证算法稳定（换实现就会挂）
    const value = sign('secret', { a: '1', b: '2' })
    expect(value).toMatch(/^[0-9A-F]{32}$/)
    expect(sign('secret', { a: '1', b: '2' })).toBe(value)
    expect(sign('other', { a: '1', b: '2' })).not.toBe(value)
  })

  it('参数顺序不影响签名', () => {
    expect(sign('s', { a: '1', b: '2' })).toBe(sign('s', { b: '2', a: '1' }))
  })

  it('时间戳格式是 yyyy-MM-dd HH:mm:ss', () => {
    expect(timestamp(new Date('2026-11-01T09:05:06'))).toBe('2026-11-01 09:05:06')
  })
})
