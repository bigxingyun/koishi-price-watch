import type { Context } from 'koishi'

import type { Config } from '../index'
import { timestamp } from './sign'
import { pddSign, taobaoSign } from './sign'

/**
 * 三个开放平台的价格查询。
 *
 * 说明：这些接口**必须有账号密钥**才能调用，没有密钥时这里会明确报「未配置」，
 * 不会假装成功。密钥从插件配置 `api.jd` / `api.pdd` / `api.taobao` 读。
 *
 * 统一返回 `ApiPrice`，由上层适配器转成 Quote。
 */

export interface ApiPrice {
  price: number
  shopName?: string
  title?: string
  /** 券后价还是标价，用来说明 */
  note?: string
}

export interface ApiOutcome {
  ok: boolean
  price?: ApiPrice
  message: string
}

const JD_GATEWAY = 'https://api.jd.com/routerjson'
const PDD_GATEWAY = 'https://gw-api.pinduoduo.com/api/router'
const TAOBAO_GATEWAY = 'https://eco.taobao.com/router/rest'

function hasJd(config: Config): boolean {
  return !!(config.api.jd.appKey && config.api.jd.appSecret)
}
function hasPdd(config: Config): boolean {
  return !!(config.api.pdd.clientId && config.api.pdd.clientSecret)
}
function hasTaobao(config: Config): boolean {
  return !!(config.api.taobao.appKey && config.api.taobao.appSecret)
}

export function apiReady(config: Config, platform: string): boolean {
  if (platform === 'jd') return hasJd(config)
  if (platform === 'pdd') return hasPdd(config)
  if (platform === 'taobao') return hasTaobao(config)
  return false
}

/** 京东联盟：按 skuId 查商品（返回券后价） */
export async function jdApiPrice(ctx: Context, config: Config, skuId: string): Promise<ApiOutcome> {
  if (!hasJd(config)) {
    return { ok: false, message: '京东未配置联盟密钥（appKey/appSecret）' }
  }
  const params: Record<string, string> = {
    method: 'jd.union.open.goods.query',
    app_key: config.api.jd.appKey,
    timestamp: timestamp(),
    format: 'json',
    v: '1.0',
    sign_method: 'md5',
    '360buy_param_json': JSON.stringify({ goodsReqDTO: { skuIds: [skuId], pageSize: 1 } }),
  }
  params.sign = (await import('./sign')).sign(config.api.jd.appSecret, params)

  try {
    const query = new URLSearchParams(params).toString()
    const res = await ctx.http.get(`${JD_GATEWAY}?${query}`, { timeout: config.collect.timeoutMs })
    const body = typeof res === 'string' ? JSON.parse(res) : res
    const data = body?.jd_union_open_goods_query_responce?.queryResult
    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    const item = parsed?.data?.[0]
    if (!item) return { ok: false, message: `京东联盟未返回商品 ${skuId}（可能不在推广池）` }
    const price = Number(item.priceInfo?.lowestPrice ?? item.priceInfo?.price)
    if (!price) return { ok: false, message: '京东联盟返回里没有价格字段' }
    return {
      ok: true,
      price: { price, shopName: item.shopInfo?.shopName, title: item.skuName, note: '联盟券后价' },
      message: 'ok',
    }
  } catch (error) {
    return { ok: false, message: `京东联盟调用失败：${(error as Error).message}` }
  }
}

/** 多多进宝：按 goods_id 查商品 */
export async function pddApiPrice(ctx: Context, config: Config, goodsId: string): Promise<ApiOutcome> {
  if (!hasPdd(config)) {
    return { ok: false, message: '拼多多未配置多多进宝密钥（clientId/clientSecret）' }
  }
  const params: Record<string, string> = {
    type: 'pdd.ddk.goods.detail',
    client_id: config.api.pdd.clientId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    data_type: 'JSON',
    goods_id_list: JSON.stringify([goodsId]),
  }
  params.sign = pddSign(config.api.pdd.clientSecret, params)

  try {
    const query = new URLSearchParams(params).toString()
    const res = await ctx.http.get(`${PDD_GATEWAY}?${query}`, { timeout: config.collect.timeoutMs })
    const body = typeof res === 'string' ? JSON.parse(res) : res
    if (body?.error_response) {
      return { ok: false, message: `多多进宝报错：${body.error_response.error_msg ?? body.error_response.sub_msg}` }
    }
    const goods = body?.goods_detail_response?.goods_details?.[0]
    if (!goods) return { ok: false, message: `多多进宝未返回商品 ${goodsId}（可能不在推广池）` }
    // 单位是分
    const price = Number(goods.min_group_price ?? goods.min_normal_price) / 100
    if (!price) return { ok: false, message: '多多进宝返回里没有价格字段' }
    return {
      ok: true,
      price: { price, shopName: goods.mall_name, title: goods.goods_name, note: '多多进宝券后价' },
      message: 'ok',
    }
  } catch (error) {
    return { ok: false, message: `多多进宝调用失败：${(error as Error).message}` }
  }
}

/** 淘宝客：按 num_iid 查商品 */
export async function taobaoApiPrice(ctx: Context, config: Config, itemId: string): Promise<ApiOutcome> {
  if (!hasTaobao(config)) {
    return { ok: false, message: '淘宝未配置淘宝客密钥（appKey/appSecret）' }
  }
  const params: Record<string, string> = {
    method: 'taobao.tbk.item.info.get',
    app_key: config.api.taobao.appKey,
    timestamp: timestamp(),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    num_iids: itemId,
    platform: '2',
  }
  params.sign = taobaoSign(config.api.taobao.appSecret, params)

  try {
    const query = new URLSearchParams(params).toString()
    const res = await ctx.http.get(`${TAOBAO_GATEWAY}?${query}`, { timeout: config.collect.timeoutMs })
    const body = typeof res === 'string' ? JSON.parse(res) : res
    if (body?.error_response) {
      return { ok: false, message: `淘宝客报错：${body.error_response.sub_msg ?? body.error_response.msg}` }
    }
    const item = body?.tbk_item_info_get_response?.results?.tbk_item_info?.[0]
    if (!item) return { ok: false, message: `淘宝客未返回商品 ${itemId}` }
    const price = Number(item.zk_final_price ?? item.reserve_price)
    if (!price) return { ok: false, message: '淘宝客返回里没有价格字段' }
    return {
      ok: true,
      price: { price, shopName: item.nick, title: item.title, note: '淘宝客折后价' },
      message: 'ok',
    }
  } catch (error) {
    return { ok: false, message: `淘宝客调用失败：${(error as Error).message}` }
  }
}

export async function apiPrice(
  ctx: Context,
  config: Config,
  platform: string,
  itemId: string,
): Promise<ApiOutcome> {
  if (platform === 'jd') return jdApiPrice(ctx, config, itemId)
  if (platform === 'pdd') return pddApiPrice(ctx, config, itemId)
  if (platform === 'taobao') return taobaoApiPrice(ctx, config, itemId)
  return { ok: false, message: `平台 ${platform} 没有 API 提供者` }
}
