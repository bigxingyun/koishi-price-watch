import type { Context } from 'koishi'

import { CATEGORY_LABEL, type Category } from '../constants'
import type { Config } from '../index'
import { withRenderPage } from '../crawler/browser'
import type { DigestModel } from './model'
import { buildLadderSheet, buildSheet, buildValueSheet, renderHtml, THEMES, themeOf, type ThemeKey } from './themes'
import { capacityValue, gpuValue, scoreOfGpu } from '../stats/bench'

/**
 * 报表出图。
 *
 * 三条硬约束（需求里明确提的）：
 * 1. **宽度受限、长度不受限**：宽度取配置 imageWidth（默认 960），高度由内容撑开，
 *    先量 scrollHeight 再把视口设成这个高度截图，所以字多会自动变长。
 * 2. **一个品类一张图**：显卡 / 内存 / 固态各出一张。
 * 3. **元素自适应**：所有主题都是流式布局（不写死高度、不裁切），长名字自动换行。
 */

export interface RenderedSheet {
  category: Category
  label: string
  buffer: Buffer
  width: number
  height: number
  mime: string
  theme: ThemeKey
}

/** 单张图的像素上限（Chromium 纹理限制），只用于防御极端情况 */
const MAX_SIDE = 32000

export const SHEET_CATEGORIES: Category[] = ['gpu', 'ram', 'ssd']

export function sheetLabel(category: Category): string {
  return CATEGORY_LABEL[category] ?? category
}

/** 截图管线：宽度固定、高度按内容撑开 */
async function shoot(ctx: Context, config: Config, html: string, width: number) {
  const shot = await withRenderPage(ctx, config, async (page) => {
    await page.setViewportSize({ width, height: 200 })
    await page.setContent(html, { waitUntil: 'load' })
    await new Promise((resolve) => setTimeout(resolve, 120))
    const height = await page.evaluate<number>(
      'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 400))',
    )
    const finalHeight = Math.min(MAX_SIDE, Math.max(400, height))
    await page.setViewportSize({ width, height: finalHeight })
    const buffer = await page.screenshot({ type: 'png', fullPage: false })
    return { buffer, height: finalHeight }
  })
  return { buffer: shot.buffer as Buffer, height: shot.height, width }
}

export async function renderSheet(
  ctx: Context,
  config: Config,
  digest: DigestModel,
  category: Category,
  theme?: ThemeKey,
): Promise<RenderedSheet> {
  const themeKey = (theme ?? config.basic.theme) as ThemeKey
  const width = Math.max(480, Math.min(1600, config.basic.imageWidth || 960))
  const sheet = buildSheet(digest, category, sheetLabel(category), themeKey, width)
  const html = renderHtml(sheet)

  const shot = await withRenderPage(ctx, config, async (page) => {
    // 测量视口必须小，否则 scrollHeight 永远不小于视口高度 → 底部留白
    await page.setViewportSize({ width, height: 200 })
    await page.setContent(html, { waitUntil: 'load' })
    await new Promise((resolve) => setTimeout(resolve, 120))

    const height = await page.evaluate<number>(
      'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 400))',
    )
    const finalHeight = Math.min(MAX_SIDE, Math.max(400, height))
    await page.setViewportSize({ width, height: finalHeight })

    const buffer = await page.screenshot({ type: 'png', fullPage: false })
    return { buffer, height: finalHeight }
  })

  return {
    category,
    label: sheetLabel(category),
    buffer: shot.buffer as Buffer,
    width,
    height: shot.height,
    mime: 'image/png',
    theme: themeKey,
  }
}

/** 渲染全部品类（显卡 → 内存 → 固态），没有数据的品类跳过 */
export async function renderSheets(
  ctx: Context,
  config: Config,
  digest: DigestModel,
  theme?: ThemeKey,
): Promise<RenderedSheet[]> {
  const out: RenderedSheet[] = []
  for (const category of SHEET_CATEGORIES) {
    const has = digest.items.some((item) => item.category === category)
    if (!has) continue
    out.push(await renderSheet(ctx, config, digest, category, theme))
  }
  return out
}

export { THEMES, themeOf }
export type { ThemeKey }

// ── 排行类报表（性价比榜 / 天梯图）──────────────────

/** 截图管线：宽度固定、高度按内容撑开 */
async function shootSheet(ctx: Context, config: Config, html: string, width: number) {
  const shot = await withRenderPage(ctx, config, async (page) => {
    await page.setViewportSize({ width, height: 200 })
    await page.setContent(html, { waitUntil: 'load' })
    await new Promise((resolve) => setTimeout(resolve, 120))
    const height = await page.evaluate<number>(
      'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 400))',
    )
    const finalHeight = Math.min(MAX_SIDE, Math.max(400, height))
    await page.setViewportSize({ width, height: finalHeight })
    const buffer = await page.screenshot({ type: 'png', fullPage: false })
    return { buffer, height: finalHeight }
  })
  return { buffer: shot.buffer as Buffer, height: shot.height, width }
}

/** 组装性价比行：显卡看「性能/价格」，内存固态看「每 GB 价格」 */
export function buildValueRows(digest: DigestModel, category: Category) {
  const items = digest.items.filter((item) => item.category === category)
  const rows = category === 'gpu'
    ? items.map((item) => gpuValue(item.name, item.price / 100))
    : items.map((item) => capacityValue(item.name, item.price / 100))
  return rows.filter((row): row is NonNullable<typeof row> => !!row)
}

export async function renderValueSheet(
  ctx: Context,
  config: Config,
  digest: DigestModel,
  category: Category,
  theme?: ThemeKey,
): Promise<RenderedSheet> {
  const themeKey = (theme ?? config.basic.theme) as ThemeKey
  const width = Math.max(480, Math.min(1600, config.basic.imageWidth || 960))
  const sheet = buildValueSheet(digest, category, buildValueRows(digest, category), themeKey, width)
  if (!sheet.items.length) throw new Error('没有可排行的数据（缺型号或价格）')
  const shot = await shootSheet(ctx, config, renderHtml(sheet), width)
  return { category, label: sheet.title, buffer: shot.buffer, width, height: shot.height, mime: 'image/png', theme: themeKey }
}

export async function renderLadderSheet(
  ctx: Context,
  config: Config,
  digest: DigestModel,
  theme?: ThemeKey,
): Promise<RenderedSheet> {
  const themeKey = (theme ?? config.basic.theme) as ThemeKey
  const width = Math.max(480, Math.min(1600, config.basic.imageWidth || 960))
  const rows = digest.items
    .filter((item) => item.category === 'gpu')
    .map((item) => ({ name: item.name, price: item.price / 100, score: scoreOfGpu(item.name) ?? 0 }))
    .filter((row) => row.score > 0)
  if (!rows.length) throw new Error('没有认出任何显卡型号的性能分')
  const sheet = buildLadderSheet(digest, rows, themeKey, width)
  const shot = await shootSheet(ctx, config, renderHtml(sheet), width)
  return { category: 'gpu', label: sheet.title, buffer: shot.buffer, width, height: shot.height, mime: 'image/png', theme: themeKey }
}