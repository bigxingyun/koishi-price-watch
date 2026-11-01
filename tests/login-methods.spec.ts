import { describe, expect, it } from 'vitest'

import { LOGIN_SPECS, describeStep, loginMethodOf } from '../src/auth/methods'
import { matchLoginCookie, snapshotChanged } from '../src/auth/login'

describe('登录方式必须按平台区分', () => {
  it('拼多多有扫码，但默认停在手机登录 tab（提示里要写清楚）', () => {
    expect(loginMethodOf('pdd')).toBe('qrcode')
    expect(LOGIN_SPECS.pdd.hint).toContain('扫码登录')
  })

  it('京东有扫码', () => {
    expect(loginMethodOf('jd')).toBe('qrcode')
    expect(LOGIN_SPECS.jd.url).toContain('passport.jd.com')
  })

  it('淘宝用桌面 UA 才有二维码（移动 UA 会跳手机号登录页）', () => {
    expect(loginMethodOf('taobao')).toBe('qrcode')
    expect(LOGIN_SPECS.taobao.desktopUA).toBe(true)
  })

  it('未接入的平台返回 unknown，而不是假装能登', () => {
    expect(loginMethodOf('suning')).toBe('unknown')
  })
})

describe('describeStep', () => {
  it('把登录方式写进一句话里', () => {
    expect(describeStep('jd', '京东')).toContain('扫码')
    expect(describeStep('pdd', '拼多多')).toContain('扫码')
  })
})

describe('matchLoginCookie（只作为行为验证的辅助证据）', () => {
  it('京东认 pt_key / pt_pin', () => {
    expect(matchLoginCookie('jd', ['__jda', 'pt_key', 'pt_pin']).hit).toBe(true)
    expect(matchLoginCookie('jd', ['__jda', 'wlfstk_smdl']).hit).toBe(false)
  })

  it('淘宝认 cookie2 / _tb_token_ / sgcookie', () => {
    expect(matchLoginCookie('taobao', ['cookie2', '_tb_token_']).hit).toBe(true)
  })

  it('拼多多认 PDDAccessToken', () => {
    expect(matchLoginCookie('pdd', ['PDDAccessToken', 'api_uid']).hit).toBe(true)
  })

  it('未知平台不瞎认', () => {
    expect(matchLoginCookie('suning', []).hit).toBe(false)
  })
})
describe('snapshotChanged（自动验证的判定核心）', () => {
  it('京东出现 pt_key 就是登录了', () => {
    const r = snapshotChanged('jd', { __jda: '10:1' }, { __jda: '10:1', pt_key: '100:9' })
    expect(r.changed).toBe(true)
    expect(r.reason).toContain('pt_key')
  })

  it('拼多多未登录时也有 PDDAccessToken，只有值变了才算登录', () => {
    const before = { PDDAccessToken: '20:111', pdd_user_id: '5:1' }
    expect(snapshotChanged('pdd', before, { ...before }).changed).toBe(false)
    expect(snapshotChanged('pdd', before, { PDDAccessToken: '24:222', pdd_user_id: '6:2' }).changed).toBe(true)
  })

  it('没有基线快照时不乱判', () => {
    expect(snapshotChanged('taobao', undefined, { cookie2: '1:1' }).changed).toBe(false)
  })
})