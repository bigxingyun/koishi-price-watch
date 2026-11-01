import type { Context } from 'koishi'

import { FetchError } from './types'

/**
 * HTTP 抓取封装：只管「发请求 + 超时 + 重试 + 伪装 UA」，不做任何平台特定的事。
 *
 * 用 ctx.http（cordis 的 http 服务）而不是裸 axios：
 * 它随插件卸载自动 abort，不会留下悬挂请求。
 */

export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'

export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export interface FetchOptions {
  headers?: Record<string, string>
  timeout?: number
  /** 失败重试次数（不含首次） */
  retries?: number
  ua?: string
}

export interface FetchResponse {
  url: string
  body: string
}

export async function fetchText(
  ctx: Context,
  url: string,
  options: FetchOptions = {},
): Promise<FetchResponse> {
  const retries = options.retries ?? 1
  const timeout = options.timeout ?? 30_000
  const headers = {
    'User-Agent': options.ua ?? DEFAULT_UA,
    'Accept-Language': 'zh-CN,zh;q=0.9',
    ...options.headers,
  }

  if (!ctx.http) throw new FetchError('没有可用的 http 服务（需要 @koishijs/plugin-http）', 0, url)

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const body = await ctx.http.get<string>(url, {
        headers,
        timeout,
        responseType: 'text',
      })
      return { url, body: typeof body === 'string' ? body : String(body) }
    } catch (error) {
      lastError = error
      const status = (error as { response?: { status?: number } })?.response?.status ?? 0
      // 4xx 不重试：重试只会加重风控
      if (status >= 400 && status < 500) {
        throw new FetchError(`HTTP ${status}`, status, url)
      }
      if (attempt < retries) await sleep(1000 * (attempt + 1))
    }
  }

  const message = (lastError as Error)?.message ?? 'unknown error'
  throw new FetchError(message, 0, url)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 随机抖动：让请求节奏看起来不像脚本 */
export function jitter(min: number, max: number): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return lo + Math.random() * (hi - lo)
}
