import type { Context } from 'koishi'

import type { Config } from '../index'
import * as repo from '../store/repo'
import { acquireProfile } from './browser'
import { MOBILE_UA } from './fetcher'

/**
 * 平台内搜索。
 *
 * 为什么需要它：型号名跟商品 ID 之间没有可推导关系。
 * 以前把型号名直接拼进 `goods.html?goods_id=`，拼出 `pdd-gpu:rtx5090-32g`
 * 这种假 ID，页面只会回「商品不存在」。
 *
 * 实测（2026-10）：
 * - 淘宝 `s.m.taobao.com` 未登录也能搜，结果在 `<a href>` 里
 * - 拼多多 `search_result.html` **直接重定向到登录页**
 * - 京东 `so.m.jd.com` 同样被拦
 *
 * 所以返回值必须区分「没搜到」和「需要登录」，否则永远说不清为什么空。
 */

export interface SearchHit {
  itemId: string
  title: string
  url: string
  score: number
}

export interface SearchResult {
  hits: SearchHit[]
  /** 搜索页被重定向到登录页 */
  needsLogin: boolean
  note?: string
}

const SEARCH_URL: Record<string, (keyword: string) => string> = {
  jd: (keyword) => `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(keyword)}`,
  pdd: (keyword) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(keyword)}`,
  taobao: (keyword) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(keyword)}`,
}

const ID_PATTERNS: Record<string, RegExp> = {
  jd: /item\.(?:m\.)?jd\.com\/(?:product\/)?(\d{6,})/,
  pdd: /goods_id=(\d{6,})/,
  taobao: /[?&](?:id|itemId)=(\d{6,})/,
}

export function searchUrlOf(platform: string, keyword: string): string | null {
  const build = SEARCH_URL[platform]
  return build ? build(keyword) : null
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim()
}

/**
 * 标题与关键词的相似度（0~1）。
 * 型号里的数字权重更高：5070 和 5080 的中文部分完全一样，只有数字能区分。
 */
export function scoreTitle(keyword: string, title: string): number {
  const keywordTokens = normalize(keyword).split(' ').filter(Boolean)
  const normalizedTitle = normalize(title)
  if (!keywordTokens.length || !normalizedTitle) return 0

  const hitTokens = keywordTokens.filter((token) => normalizedTitle.includes(token))
  const wordScore = hitTokens.length / keywordTokens.length

  const numberTokens = keywordTokens.filter((token) => /\d/.test(token))
  const hitNumbers = numberTokens.filter((token) => normalizedTitle.includes(token))
  const numberScore = numberTokens.length ? hitNumbers.length / numberTokens.length : 0

  return Number((wordScore * 0.6 + numberScore * 0.4).toFixed(3))
}

const LOGIN_PAGE = /login\.|passport\.|\/login|plogin/i

export async function searchPlatform(
  ctx: Context,
  config: Config,
  platform: string,
  keyword: string,
  limit = 5,
): Promise<SearchResult> {
  const url = searchUrlOf(platform, keyword)
  const pattern = ID_PATTERNS[platform]
  if (!url || !pattern) return { hits: [], needsLogin: false, note: `不支持在 ${platform} 搜索` }

  let browser
  try {
    browser = await acquireProfile(ctx, config, platform)
  } catch (error) {
    return { hits: [], needsLogin: false, note: (error as Error).message }
  }

  const page = await browser.newPage({
    viewport: { width: 420, height: 900 },
    userAgent: MOBILE_UA,
    isMobile: true,
    hasTouch: true,
  })

  try {
    if (!page.goto) return { hits: [], needsLogin: false, note: '浏览器不支持 goto' }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs })

    // 等内容真正渲染：拼多多/京东的列表是懒加载的，
    // 只看 <a> 数量会在「页面还是空白」时直接判失败（曾被误判成需要登录）。
    // 判据改成：正文有实质内容（去掉零宽字符后 > 200 字）或链接够多。
    let currentUrl = ''
    let ready = false
    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      currentUrl = (await page.evaluate<string>('location.href')) ?? ''
      if (LOGIN_PAGE.test(currentUrl)) break
      if (i === 4) {
        // 滚动触发懒加载
        await page.evaluate('window.scrollBy(0, 600)').catch(() => undefined)
      }
      const state = await page.evaluate<{ links: number; text: number }>(`({
        links: document.querySelectorAll('a[href]').length,
        text: (document.body ? document.body.innerText : '').replace(/[\\u200b-\\u200d]/g, '').replace(/\\s+/g, ' ').length,
      })`)
      if ((state?.links ?? 0) > 5 || (state?.text ?? 0) > 200) {
        ready = true
        break
      }
    }

    if (LOGIN_PAGE.test(currentUrl)) {
      return {
        hits: [],
        needsLogin: true,
        note: `搜索页被重定向到登录页（${(currentUrl ?? '').slice(0, 60)}）`,
      }
    }

    if (!ready) {
      return {
        hits: [],
        needsLogin: false,
        note: '搜索页 12 秒内没有渲染出内容（可能加载很慢或被风控），不是登录问题',
      }
    }

    const links = await page.evaluate<Array<{ href: string; text: string }>>(`(() => {
      const out = []
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href || ''
        const text = (a.textContent || '').replace(/\\s+/g, ' ').trim()
        if (href && text) out.push({ href, text })
      }
      for (const el of document.querySelectorAll('[data-item-id], [data-goods-id]')) {
        const id = el.getAttribute('data-item-id') || el.getAttribute('data-goods-id')
        if (id) out.push({ href: 'item://' + id, text: (el.textContent || '').replace(/\\s+/g, ' ').trim() })
      }
      return out.slice(0, 400)
    })()`)

    const seen = new Set<string>()
    const hits: SearchHit[] = []
    for (const link of links ?? []) {
      const itemId = link.href.startsWith('item://')
        ? link.href.slice(7)
        : (link.href.match(pattern)?.[1] ?? null)
      if (!itemId || seen.has(itemId)) continue
      seen.add(itemId)
      const title = link.text.slice(0, 80)
      if (title.length < 4) continue
      hits.push({ itemId, title, url: link.href, score: scoreTitle(keyword, title) })
    }

    hits.sort((a, b) => b.score - a.score)
    if (hits.length) return { hits: hits.slice(0, limit), needsLogin: false }

    // 一条都没拿到：再看页面是不是登录墙 / 空壳
    const body = (await page.evaluate<string>('(document.body.innerText || "").slice(0, 300)')) ?? ''
    const loginish = /登录|扫码|验证码|下载.*APP/i.test(body)
    const bare = body.trim().length < 30
    if (loginish || bare) {
      return {
        hits: [],
        needsLogin: true,
        note: loginish
          ? `搜索页要求登录（页面提示：${body.replace(/\s+/g, ' ').slice(0, 40)}）`
          : '搜索页没返回任何内容（多为未登录：接口对匿名会话基本空白）',
      }
    }
    if (platform === 'pdd' || platform === 'jd') {
      return {
        hits: [],
        needsLogin: false,
        note: '页面已渲染出商品，但拿不到可用的商品 ID（这些平台的卡片不是 a 标签），需要手动绑定商品链接',
      }
    }
    return { hits: [], needsLogin: false }
  } catch (error) {
    return { hits: [], needsLogin: false, note: (error as Error).message }
  } finally {
    await page.close().catch(() => undefined)
  }
}

/** 记住「等登录后再搜一次」的请求 */
export async function queueSearch(ctx: Context, platform: string, keyword: string): Promise<void> {
  await repo.metaSet(ctx, 'search:pending', JSON.stringify({ platform, keyword }))
}

export interface PendingSearchResult {
  platform: string
  keyword: string
  text: string
}

function formatHits(platform: string, keyword: string, hits: SearchHit[], note?: string): string {
  if (!hits.length) {
    return `登录成功，但重试搜索「${keyword}」仍然没结果${note ? '：' + note : ''}`
  }
  return [
    `登录成功，已重试搜索「${keyword}」（${platform}）：`,
    ...hits.map((hit, index) => `${index + 1}. [${(hit.score * 100).toFixed(0)}%] ${hit.title.slice(0, 36)}　${hit.itemId}`),
    '',
    `要绑就给链接或 ID：价格 管理 绑定 「型号」 ${platform}`,
  ].join('\n')
}

/** 登录成功后调用：把挂起的搜索真的跑一遍 */
export async function runPendingSearch(
  ctx: Context,
  config: Config,
): Promise<PendingSearchResult | null> {
  const raw = await repo.metaGet(ctx, 'search:pending')
  if (!raw) return null
  await repo.metaDel(ctx, 'search:pending').catch(() => undefined)

  let platform = ''
  let keyword = ''
  try {
    const parsed = JSON.parse(raw) as { platform?: string; keyword?: string }
    platform = parsed.platform ?? ''
    keyword = parsed.keyword ?? ''
  } catch {
    return null
  }
  if (!platform || !keyword) return null

  const found = await searchPlatform(ctx, config, platform, keyword, 5)
  return { platform, keyword, text: formatHits(platform, keyword, found.hits, found.note) }
}