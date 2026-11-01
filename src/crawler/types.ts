import type { Context } from 'koishi'

import type { Config } from '../index'
import type { PwModel, PwOffer } from '../store/model'

/** 采集任务的输入 */
export interface AdapterJob {
  ctx: Context
  config: Config
  offer: PwOffer
  model: PwModel
  day: number
}

/** 一次采集的结果 */
export interface Quote {
  /** 到手价（分） */
  price: number
  /** 标价（分），可选 */
  listPrice?: number
  /** STATUS.* */
  status: number
  /** 解析失败/降级原因的简短说明，写进日志 */
  note?: string
}

export class FetchError extends Error {
  constructor(message: string, readonly status = 0, readonly url = '') {
    super(message)
    this.name = 'FetchError'
  }
}

/** 解析失败（页面结构变了 / 价格被混淆） */
export class ParseError extends Error {
  constructor(message: string, readonly sample = '') {
    super(message)
    this.name = 'ParseError'
  }
}

/** 登录态失效 / 验证码：需要熔断并通知主人 */
export class AuthError extends Error {
  constructor(message: string, readonly platform = '') {
    super(message)
    this.name = 'AuthError'
  }
}

export interface Adapter {
  platform: string
  /** 是否需要浏览器（决定采集时是否 lease 浏览器池） */
  needsBrowser?: boolean
  fetch(job: AdapterJob): Promise<Quote>
}
