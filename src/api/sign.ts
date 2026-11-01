import { createHash } from 'node:crypto'

/**
 * 三家开放平台的签名。
 *
 * 都是同一个套路：`MD5(secret + 按 key 排序后的 k+v 串 + secret)`，转大写。
 * 京东联盟、淘宝客、多多进宝的差异只在参数名，算法一致 —— 所以抽成一个函数。
 */

export type Params = Record<string, string | number | undefined>

/** 过滤空值并按 key 字典序拼接 k+v */
export function canonical(params: Params): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('')
}

/** secret + 拼串 + secret，MD5 后大写 */
export function sign(secret: string, params: Params): string {
  return createHash('md5').update(secret + canonical(params) + secret).digest('hex').toUpperCase()
}

/** 时间戳：各平台都接受 `yyyy-MM-dd HH:mm:ss` */
export function timestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 京东联盟：参数塞进 360buy_param_json，签名只覆盖外层 */
export function jdSign(secret: string, params: Params): string {
  return sign(secret, params)
}

/** 拼多多：sign 覆盖除 sign 之外的全部参数 */
export function pddSign(secret: string, params: Params): string {
  return sign(secret, params)
}

/** 淘宝：sign 覆盖除 sign 之外的全部参数 */
export function taobaoSign(secret: string, params: Params): string {
  return sign(secret, params)
}
