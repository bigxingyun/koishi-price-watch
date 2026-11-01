import { describe, expect, it } from 'vitest'

import { adminHint, ensureAdmin, isTrustedPlatform } from '../src/util/auth'
import type { Config } from '../src/index'
import type { Session } from 'koishi'

const config = { advanced: { owners: ['onebot:10001'] } } as unknown as Config

/** 造一个够用的假会话 */
function fakeSession(platform: string, userId = '10000', authority = 0): Session {
  return {
    platform,
    userId,
    channelId: 'chan',
    selfId: 'bot',
    user: { authority },
  } as unknown as Session
}

describe('isTrustedPlatform', () => {
  it('控制台沙盒是 sandbox:随机后缀，必须按前缀认', () => {
    expect(isTrustedPlatform('sandbox:abc123')).toBe(true)
    expect(isTrustedPlatform('sandbox')).toBe(true)
  })

  it('测试假平台 mock 也算可信', () => {
    expect(isTrustedPlatform('mock')).toBe(true)
  })

  it('真实平台不可信', () => {
    expect(isTrustedPlatform('onebot')).toBe(false)
    expect(isTrustedPlatform('qq')).toBe(false)
    expect(isTrustedPlatform('telegram')).toBe(false)
    expect(isTrustedPlatform(undefined)).toBe(false)
  })
})

describe('ensureAdmin', () => {
  it('沙盒会话直接放行（否则控制台里什么都测不了）', async () => {
    expect(await ensureAdmin(null, fakeSession('sandbox:9f3k2'), config)).toBe(true)
  })

  it('白名单命中放行，未命中拒绝', async () => {
    expect(await ensureAdmin(null, fakeSession('onebot', '10001'), config)).toBe(true)
    expect(await ensureAdmin(null, fakeSession('onebot', '99999'), config)).toBe(false)
  })

  it('authority >= 4 放行', async () => {
    expect(await ensureAdmin(null, fakeSession('onebot', '99999', 4), config)).toBe(true)
  })

  it('没有会话时拒绝', async () => {
    expect(await ensureAdmin(null, undefined, config)).toBe(false)
  })
})

describe('adminHint', () => {
  it('提示里给出可直接复制的 平台:用户ID', () => {
    const hint = adminHint(fakeSession('onebot', '123456'))
    expect(hint).toContain('onebot:123456')
    expect(hint).toContain('价格 管理 我是谁')
  })
})
