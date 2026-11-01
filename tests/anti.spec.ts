import { describe, expect, it } from 'vitest'

import {
  AntiProtocolStaleError,
  DISABLE_MS,
  FAIL_THRESHOLD,
  afterFailure,
  afterSuccess,
  afterUnimplemented,
  describeHealth,
  initialHealth,
  isUsable,
} from '../src/anti/health'

/**
 * 反爬协议层的健康状态机（隔离模块）。
 *
 * 目的：保证协议失效时**只熔断自己**，不会把采集主线拖下水。
 * 这些用例就是「不会拖累主线」的合同。
 */

const now = 1_000_000

describe('初始状态', () => {
  it('未实现的协议标 unimplemented，且不可用', () => {
    const health = initialHealth('jd')
    expect(health.state).toBe('unimplemented')
    expect(isUsable(health, now)).toBe(false)
  })
})

describe('失败累计与熔断', () => {
  it('普通失败未达阈值：仍可用，只记次数', () => {
    let health = afterSuccess(initialHealth('pdd'), now)
    health = afterFailure(health, new Error('网络抖动'), now)
    expect(health.failures).toBe(1)
    expect(health.disabledUntil).toBe(0)
    expect(isUsable(health, now)).toBe(true)
  })

  it(`连续失败 ${FAIL_THRESHOLD} 次 → degraded 并熔断`, () => {
    let health = afterSuccess(initialHealth('pdd'), now)
    for (let i = 0; i < FAIL_THRESHOLD; i++) health = afterFailure(health, new Error('boom'), now)
    expect(health.state).toBe('degraded')
    expect(health.disabledUntil).toBe(now + DISABLE_MS)
    expect(isUsable(health, now)).toBe(false)
  })

  it('熔断到期后恢复可用', () => {
    let health = afterSuccess(initialHealth('pdd'), now)
    for (let i = 0; i < FAIL_THRESHOLD; i++) health = afterFailure(health, new Error('boom'), now)
    expect(isUsable(health, now + DISABLE_MS + 1)).toBe(true)
  })

  it('成功后清零', () => {
    let health = afterFailure(afterSuccess(initialHealth('pdd'), now), new Error('x'), now)
    health = afterSuccess(health, now + 1)
    expect(health.failures).toBe(0)
    expect(health.state).toBe('ok')
    expect(health.lastReason).toBeUndefined()
  })
})

describe('协议过期', () => {
  it('过期立刻 stale，而不是等累计次数', () => {
    const health = afterFailure(afterSuccess(initialHealth('jd'), now), new AntiProtocolStaleError('jd', 'h5st 版本已更新'), now)
    expect(health.state).toBe('stale')
    expect(isUsable(health, now)).toBe(false)
  })

  it('过期不会被普通成功掩盖（需要显式更新版本）', () => {
    const stale = afterFailure(afterSuccess(initialHealth('jd'), now), new AntiProtocolStaleError('jd', 'x'), now)
    expect(stale.state).toBe('stale')
    expect(afterUnimplemented(stale).state).toBe('unimplemented')
  })
})

describe('文案', () => {
  it('未实现说清楚是「尚未实现」，不是「失败」', () => {
    expect(describeHealth(initialHealth('taobao'))).toContain('尚未实现')
  })

  it('熔断时给出到期时间', () => {
    let health = afterSuccess(initialHealth('pdd'), now)
    for (let i = 0; i < FAIL_THRESHOLD; i++) health = afterFailure(health, new Error('x'), Date.now())
    expect(describeHealth(health)).toContain('熔断至')
  })
})
