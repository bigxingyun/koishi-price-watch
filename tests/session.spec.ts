import { describe, expect, it } from 'vitest'

import { afterAdvance, decide, type Session, type StepEvent } from '../src/auth/state'

/**
 * P3：登录状态机决策表（纯函数，无 koishi 运行时）。
 */

const now = 1_000_000
const timeout = 120_000

function session(overrides: Partial<Session> = {}): Session {
  return {
    queue: ['jd', 'taobao'],
    current: 'pdd',
    results: {},
    deadline: now + 60_000,
    refreshedAt: now,
    startedAt: now - 1000,
    ...overrides,
  }
}

describe('decide：事件 → 动作', () => {
  const table: Array<[string, Partial<Session>, StepEvent, string]> = [
    ['验证通过 → 推进为成功', {}, 'verify_ok', 'advance_ok'],
    ['手动确认 → 推进为成功', {}, 'confirm', 'advance_ok'],
    ['手动跳过 → 推进为跳过', {}, 'skip', 'advance_skipped'],
    ['超时事件 → 跳过', {}, 'timeout', 'advance_skipped'],
    ['刚出过码且验证未通过 → 等待', {}, 'verify_no', 'wait'],
    ['码已 46 秒 → 换码', { refreshedAt: now - 46_000 }, 'verify_no', 'refresh_qr'],
    ['码已 30 秒 → 还不换', { refreshedAt: now - 30_000 }, 'verify_no', 'wait'],
  ]

  for (const [name, patch, event, expected] of table) {
    it(name, () => {
      expect(decide(session(patch), event, now)).toBe(expected)
    })
  }

  it('已过期时任何事件都跳过（不允许卡在「剩余 0 秒」）', () => {
    const expired = session({ deadline: now - 1 })
    for (const event of ['verify_ok', 'verify_no', 'skip', 'confirm', 'timeout'] as StepEvent[]) {
      expect(decide(expired, event, now)).toBe('advance_skipped')
    }
  })

  it('deadline 为 0 时不算过期', () => {
    expect(decide(session({ deadline: 0 }), 'verify_ok', now)).toBe('advance_ok')
    expect(decide(session({ deadline: 0 }), 'verify_no', now)).toBe('wait')
  })
})

describe('afterAdvance：推进后的状态', () => {
  it('还有下一个平台 → current 前进、结果保留、队列缩短、deadline 顺延', () => {
    const next = afterAdvance(session(), 'skipped', timeout, now)
    expect(next?.results.pdd).toBe('skipped')
    expect(next?.current).toBe('jd')
    expect(next?.queue).toEqual(['taobao'])
    expect(next?.deadline).toBe(now + timeout)
  })

  it('队列空了 → 返回 null（流程结束）', () => {
    expect(afterAdvance(session({ current: 'taobao', queue: [] }), 'ok', timeout, now)).toBeNull()
  })

  it('不会丢掉已有结果', () => {
    const next = afterAdvance(session({ results: { pdd: 'skipped' }, current: 'jd', queue: ['taobao'] }), 'ok', timeout, now)
    expect(next?.results).toMatchObject({ pdd: 'skipped', jd: 'ok' })
    expect(next?.current).toBe('taobao')
  })

  it('单平台：一次推进就结束', () => {
    const single = session({ current: 'pdd', queue: [] })
    expect(afterAdvance(single, 'ok', timeout, now)).toBeNull()
  })
})
