import type { Context } from 'koishi'

import type { Config } from '../index'
import { acquireProfile } from '../crawler/browser'
import { clickProductByKeyword, humanScroll, humanSearch } from '../crawler/human'
import { isValidItemId } from '../util/itemId'
import * as repo from '../store/repo'
import { modelMatches } from '../domain/quote'
import { bindOffer } from './offers'

/**
 * 仿真发现（L3）：搜索 → 点商品卡 → 从落地页读数 → 自动建立报价。
 *
 * 为什么要有它：之前「必须先绑定链接才能采集」是设计遗留。
 * 仿真本来就是「像人一样搜、点、看」，那么顺手就能拿到 id / 标题 / 价格，
 * 根本不需要用户先贴链接。
 *
 * 各平台已验证的情况：
 *   拼多多  search_result.html → 点卡 → 落地 goods.html?goods_id=… → 有价（实测 ¥7,888）
 *   淘宝    s.m.taobao.com/h5 → 点卡 → 落地 item.taobao.com/item.htm?id=…（需登录态）
 *   京东    search.jd.com（PC）→ 登录后才可用
 */

export interface SimulateOptions {
  /** 只处理这些平台 */
  platforms?: string[]
  /** 最多处理多少个型号（控制耗时） */
  modelLimit?: number
}

export interface SimulateResult {
  tried: number
  bound: number
  priced: number
  byPlatform: Record<string, { bound: number; priced: number; failed: number; note?: string }>
  notes: string[]
}

const SEARCH_URL: Record<string, (keyword: string) => string> = {
  taobao: (kw) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(kw)}`,
}

const ITEM_ID_RE: Record<string, RegExp> = {
  pdd: /goods_id=(\d{6,})/,
  taobao: /[?&]id=(\d{6,})/,
  jd: /\/(\d{6,})\.html/,
}

const PLATFORM_ZH: Record<string, string> = { pdd: '拼多多', taobao: '淘宝', jd: '京东' }

/** 从落地页读标题、价格、店铺，并提取商品 id */
async function readLanded(
  page: { evaluate: <T = unknown>(script: string) => Promise<T> },
): Promise<{ href: string; title: string; price: number; shop: string; body: string }> {
  const raw = await page.evaluate<{ href: string; title: string; price: string; shop: string; body: string }>(`(() => {
    const clean = (s) => (s || '').replace(/[\\u200b-\\u200d]/g, '').replace(/\\s+/g, ' ').trim()
    const text = clean(document.body ? document.body.innerText : '')
    const m = text.match(/大促价\\s*[¥￥]\\s*([0-9]+(?:\\.[0-9]+)?)/)
      || text.match(/券后\\s*[¥￥]\\s*([0-9]+(?:\\.[0-9]+)?)/)
      || text.match(/[¥￥]\\s*([0-9]{2,6}(?:\\.[0-9]+)?)/)
    const shop = (document.querySelector('[class*="shop" i]')?.textContent || '').trim().slice(0, 30)
    return { href: location.href, title: document.title, price: m ? m[1] : '', shop, body: text.slice(0, 300) }
  })()`)
  return {
    href: raw?.href ?? '',
    title: (raw?.title ?? '').trim(),
    price: Number(raw?.price ?? 0) || 0,
    shop: raw?.shop ?? '',
    body: raw?.body ?? '',
  }
}

export async function discoverBySimulation(
  ctx: Context,
  config: Config,
  options: SimulateOptions = {},
): Promise<SimulateResult> {
  const platforms = options.platforms?.length ? options.platforms : ['taobao']
  const modelLimit = Math.max(1, options.modelLimit ?? 3)

  const result: SimulateResult = { tried: 0, bound: 0, priced: 0, byPlatform: {}, notes: [] }
  for (const platform of platforms) result.byPlatform[platform] = { bound: 0, priced: 0, failed: 0 }

  const models = await repo.listModels(ctx)
  const offers = await repo.listOffers(ctx)
  const bound = new Set(offers.filter((o) => isValidItemId(o.platform, o.itemId)).map((o) => `${o.modelId}:${o.platform}`))

  const pending = models.filter((model) => platforms.some((p) => !bound.has(`${model.id}:${p}`))).slice(0, modelLimit)
  if (!pending.length) {
    result.notes.push('所有型号都已绑定，无需仿真发现')
    return result
  }

  for (const model of pending) {
    result.tried++
    for (const platform of platforms) {
      if (bound.has(`${model.id}:${platform}`)) continue
      const stat = result.byPlatform[platform]!
      const urlOf = SEARCH_URL[platform]
      if (!urlOf) { stat.failed++; continue }

      const session = await acquireProfile(ctx, config, platform as never).catch(() => null)
      if (!session) { stat.failed++; continue }
      const page = await session.newPage({
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
      })
      try {
        if (!page.goto) { stat.failed++; continue }
        if (platform === 'jd') {
          // 京东直接访问搜索 URL 会触发「抱歉」风控页，改走首页搜索框
          await page.goto('https://www.jd.com/', { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs })
          await new Promise((resolve) => setTimeout(resolve, 2500))
          await humanSearch(page, model.name, {}).catch(() => false)
        } else {
          await page.goto(urlOf(model.name), { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs })
        }
        // 列表是懒加载：等内容 + 滚一屏
        for (let i = 0; i < 8; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          const len = await page.evaluate<number>(
            `((document.body ? document.body.innerText : '').replace(/[\\u200b-\\u200d]/g, '').length)`,
          ).catch(() => 0)
          if ((len ?? 0) > 300) break
        }
        await humanScroll(page, { scrolls: 2 })

        const clicked = await clickProductByKeyword(page, model.name).catch(() => false)
        if (!clicked) {
          stat.failed++
          const note = `${PLATFORM_ZH[platform] ?? platform} 搜索页没有可点开的商品卡`
          if (!result.notes.includes(note)) result.notes.push(note)
          continue
        }

        const landed = await readLanded(page)
        const itemId = landed.href.match(ITEM_ID_RE[platform] ?? /(\d{6,})/)?.[1]
        if (!itemId || !isValidItemId(platform, itemId)) {
          stat.failed++
          const note = `${PLATFORM_ZH[platform] ?? platform} 落地页没有商品 ID（${landed.href.slice(0, 50)}）`
          if (!result.notes.includes(note)) result.notes.push(note)
          continue
        }

        // 落地页标题/正文必须含目标型号，否则就是点错了卡片（配件、引流款）
        const matched = modelMatches(model.name, landed.title + ' ' + landed.body)
        if (!matched.matches) {
          stat.failed++
          const note = `${PLATFORM_ZH[platform] ?? platform} 点到的不是目标型号（${landed.title.slice(0, 20)}），已跳过`
          if (!result.notes.includes(note)) result.notes.push(note)
          continue
        }

        await bindOffer(ctx, { model, platform, itemId, url: landed.href.split('?')[0], shopName: landed.shop })
        bound.add(`${model.id}:${platform}`)
        stat.bound++
        result.bound++
        if (landed.price) {
          stat.priced++
          result.priced++
        }
      } catch (error) {
        stat.failed++
        const note = `${PLATFORM_ZH[platform] ?? platform} 仿真发现失败：${(error as Error).message.slice(0, 40)}`
        if (!result.notes.includes(note)) result.notes.push(note)
      } finally {
        await page.close().catch(() => undefined)
      }
    }
  }

  return result
}

export function describeSimulate(result: SimulateResult): string {
  if (!result.tried) return result.notes[0] ?? '无需仿真发现'
  const parts = Object.entries(result.byPlatform)
    .filter(([, stat]) => stat.bound > 0)
    .map(([platform, stat]) => `${PLATFORM_ZH[platform] ?? platform} ${stat.bound}`)
  return [
    `仿真发现：扫 ${result.tried} 个型号，自动绑定 ${result.bound} 条${parts.length ? `（${parts.join(' / ')}）` : ''}`,
    ...result.notes.map((note) => `  · ${note}`),
  ].join('\n')
}
