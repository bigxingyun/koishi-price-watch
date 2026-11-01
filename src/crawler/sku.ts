import type { PageLike } from './browser'
import { humanDelay } from './human'

/**
 * 切 SKU（规格型号）。
 *
 * 为什么必须做：一个商品链接里有多档 SKU（不同型号/容量/版本），
 * 默认选中的往往不是我们要盯的那个。不切 SKU 直接读价，
 * 就会把引流款的价格当成目标型号的价格。
 *
 * 判据：点完之后页面上的「已选：」文本必须包含目标型号代号
 * （拼多多页面直接写「已选：华硕PRIME-RTX5070TI-O16G…」）。
 */

interface SkuUi {
  panel: string
  option: string
}

/** 各平台规格面板选择器（拼多多为实测值，其余待探测后校准） */
const SKU_UI: Record<string, SkuUi> = {
  taobao: {
    panel: '[class*="sku"], [class*="Sku"]',
    option: '[class*="sku"] li, [class*="sku"] div, [class*="sku"] span',
  },
}

/** 从型号名里抽代号：RTX 5070 Ti 16G → ['5070ti'] */
export function modelTokens(name: string): string[] {
  const out: string[] = []
  const re = /(?:rtx|gtx|rx|arc)?\s*(\d{4})\s*(ti|super|xt|xtx|gre)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(name))) {
    const num = m[1]
    const suffix = (m[2] ?? '').toLowerCase()
    if (num) out.push(suffix ? num + suffix : num)
  }
  return [...new Set(out)]
}

export interface SkuResult {
  ok: boolean
  selected: string
  reason?: string
}

export async function selectSku(page: PageLike, platform: string, targetModel: string): Promise<SkuResult> {
  const ui = SKU_UI[platform]
  const tokens = modelTokens(targetModel)
  if (!ui) return { ok: false, selected: '', reason: '该平台未配置规格面板' }
  if (!tokens.length) return { ok: true, selected: '', reason: '目标型号无代号，跳过切 SKU' }

  const mouse = (page as unknown as { mouse?: { click?: (x: number, y: number) => Promise<unknown> } }).mouse

  // ① 尝试打开规格面板（已经展开时点一下也无害）
  const panelBox = await page
    .evaluate<{ x: number; y: number } | null>(
      `(() => {
        const el = document.querySelector(${JSON.stringify(ui.panel)})
        if (!el) return null
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect()
        if (r.width < 40) return null
        return { x: r.left + r.width / 2, y: Math.min(r.top + 24, window.innerHeight - 40) }
      })()`,
    )
    .catch(() => null)
  if (panelBox && mouse?.click) {
    await mouse.click(panelBox.x, panelBox.y).catch(() => undefined)
    await humanDelay({ delay: [600, 1200] })
  }

  // ② 在面板里找含目标代号的选项并真实点击
  const picked = await page
    .evaluate<{ label: string; x: number; y: number } | null>(
      `(() => {
        const tokens = ${JSON.stringify(tokens)}
        const nodes = Array.from(document.querySelectorAll(${JSON.stringify(ui.option)}))
        for (const el of nodes) {
          const t = (el.textContent || '').replace(/\\s+/g, '').trim()
          if (!t || t.length > 40) continue
          const low = t.toLowerCase()
          if (!tokens.every((tk) => low.includes(String(tk).toLowerCase()))) continue
          el.scrollIntoView({ block: 'center' })
          const r = el.getBoundingClientRect()
          if (r.width < 24 || r.height < 12) continue
          return { label: t, x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }
        return null
      })()`,
    )
    .catch(() => null)

  if (!picked) {
    // 没有面板也没有「已选」= 这个商品只有一个型号，不需要切
    const hasPanel = await page
      .evaluate<boolean>(`(() => {
        const clean = (s) => (s || '').replace(/\\s+/g, ' ')
        return /已选[:：]/.test(clean(document.body ? document.body.innerText : ''))
      })()`)
      .catch(() => false)
    if (!hasPanel) return { ok: true, selected: '', reason: '该商品只有一个型号，无需切换' }
    return { ok: false, selected: '', reason: `面板里找不到含 ${tokens.join('/')} 的选项` }
  }
  if (mouse?.click) await mouse.click(picked.x, picked.y).catch(() => undefined)
  await humanDelay({ delay: [900, 1600] })

  // ③ 读「已选：」确认
  const selected = await page
    .evaluate<string>(
      `(() => {
        const clean = (s) => (s || '').replace(/[\\u200b-\\u200d]/g, '').replace(/\\s+/g, ' ').trim()
        const panel = document.querySelector('[class*="sku-plus"], [class*="sku"]')
        const text = clean(panel ? panel.textContent : document.body.innerText)
        const m = text.match(/已选[:：]\\s*([^集]{0,40})/)
        return m ? m[1].trim() : ''
      })()`,
    )
    .catch(() => '')

  const lower = selected.toLowerCase()
  const hit = selected ? tokens.every((tk) => lower.includes(tk)) : false
  return {
    ok: hit,
    selected,
    reason: hit ? undefined : `已选与目标不符：${selected || '（读不到已选文本）'}`,
  }
}
