/**
 * 从页面正文里挑出「最可能是商品价」的那个数字。
 *
 * 为什么不能「匹配第一个 ¥」：拼多多同一页面在不同渲染下，正文里
 * ¥ 的先后顺序不一样 —— 有时第一处是「大促价 ¥12599」，有时先出现
 * 「¥1」「¥9.9」这类件数/优惠噪声。按位置取就会取错。
 *
 * 策略：
 *   1. 把所有「上下文词 + ¥数字」都收集起来
 *   2. 只要 100–200000 区间内的（排除件数、优惠、分期）
 *   3. 优先带价格关键词的（大促价/券后/拼单价/秒杀价）
 *   4. 否则取中位数，避免被单个极端值带偏
 */

export interface PriceCandidate {
  /** ¥ 前面的上下文词，例如「大促价」「券后」 */
  ctx: string
  price: number
}

/** 页面里执行：收集所有价格候选（返回 JSON 字符串，便于跨进程传递） */
export const COLLECT_PRICES_JS = [
  '(() => {',
  '  const text = (document.body ? document.body.innerText : "")',
  '    .replace(/[\\u200b-\\u200d]/g, "")',
  '    .replace(/[ \\t]+/g, " ")',
  '  const out = []',
  '  const re = /(大促价|券后|拼单价|秒杀价|活动价|到手价|已选)?[^0-9\\n]{0,10}[\\u00a5\\uffe5]\\s*([0-9]{1,7}(?:\\.[0-9]{1,2})?)/g',
  '  let m',
  '  while ((m = re.exec(text)) && out.length < 30) {',
  '    out.push({ ctx: m[1] || "", price: Number(m[2]) })',
  '  }',
  '  return JSON.stringify(out)',
  '})()',
].join('\n')

/** 纯函数：从候选里挑一个可信价格（可单测） */
export function pickPrice(candidates: PriceCandidate[]): { price: number; reason?: string } {
  const usable = candidates.filter((c) => Number.isFinite(c.price) && c.price >= 100 && c.price <= 200000)
  if (!usable.length) return { price: 0, reason: '没有落在合理区间的价格候选' }

  const keyed = usable.filter((c) => /大促价|券后|拼单价|秒杀价|活动价|到手价/.test(c.ctx))
  const pool = keyed.length ? keyed : usable

  if (keyed.length) {
    // 带关键词的取最大值：同一段里通常先是原价、后是券后价，取高的那个更保守
    return { price: Math.max(...keyed.map((c) => c.price)) }
  }

  const sorted = [...pool].map((c) => c.price).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  return { price: median, reason: `无价格关键词，取中位数（${sorted.length} 个候选）` }
}
