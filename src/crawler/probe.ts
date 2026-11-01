import { Context } from 'koishi'

import type { Config } from '../index'
import { withRenderPage } from './browser'
import { MOBILE_UA } from './fetcher'

/**
 * 页面诊断：把浏览器真正看到的东西吐出来（地址、标题、价格候选、正文开头）。
 *
 * 用途：当「采集失败」时，不用猜是被登录墙挡了、还是选择器过期了、还是价格被混淆了。
 * `价格 管理 诊断 京东 <商品ID>` 直接调它。
 */
export interface PageProbe {
  ok: boolean
  href: string
  title: string
  priceTexts: string[]
  bodyHead: string
  error?: string
  elapsedMs: number
}

export async function probePage(
  ctx: Context,
  config: Config,
  url: string,
  options: { waitMs?: number } = {},
): Promise<PageProbe> {
  const started = Date.now()
  try {
    return await withRenderPage(ctx, config, async (page) => {
      if (!page.goto) throw new Error('浏览器实现不支持 goto')
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs })
      await new Promise((resolve) => setTimeout(resolve, options.waitMs ?? 3500))

      const info = await page.evaluate<{
        href: string
        title: string
        priceTexts: string[]
        bodyHead: string
      }>(`(() => {
        const texts = Array.from(document.querySelectorAll('[class*="price" i], [class*="Price"]'))
          .slice(0, 8)
          .map((el) => (el.textContent || '').trim().slice(0, 32))
          .filter(Boolean)
        return {
          href: location.href,
          title: document.title,
          priceTexts: texts,
          bodyHead: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 240),
        }
      })()`)

      return {
        ok: true,
        href: info.href,
        title: info.title,
        priceTexts: info.priceTexts,
        bodyHead: info.bodyHead,
        elapsedMs: Date.now() - started,
      }
    })
  } catch (error) {
    return {
      ok: false,
      href: url,
      title: '',
      priceTexts: [],
      bodyHead: '',
      error: (error as Error).message,
      elapsedMs: Date.now() - started,
    }
  }
}

/** 平台 → 商品页 URL */
export function offerUrl(platform: string, itemId: string): string {
  if (platform === 'jd') return `https://item.m.jd.com/product/${itemId}.html`
  if (platform === 'pdd') return `https://mobile.yangkeduo.com/goods.html?goods_id=${itemId}`
  return `https://item.taobao.com/item.htm?id=${itemId}`
}

/** 判断页面是否落在登录域 */
export function isLoginDomain(href: string): boolean {
  return /passport\.|login\.|signin\.|\/login|\.taobao\.com\/member/i.test(href)
}

export { MOBILE_UA }
