/**
 * 价格解析与清洗：纯函数，最容易测试，也是采集链路上最容易被页面改版打崩的一环。
 */
import { STATUS } from '../constants'

/**
 * 解析价格文本为「分」。
 *
 * 支持：`¥6,299.00`、`6299`、`6,299`、`￥ 1299.9`、`6299元`
 * 明确拒绝：京东的混淆价 `3??9` / `4?`、`暂无报价`、空串
 *
 * 返回 null 表示「解析不出可信价格」，调用方应当按失败处理，**不要猜**。
 */
export function parsePrice(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? Math.round(input * 100) : null
  }
  if (typeof input !== 'string') return null

  const text = input.trim()
  if (!text) return null
  // 混淆价/占位符：任何非数字的价格字符都直接判死，避免把 3??9 读成 39
  if (/[?？*]/.test(text)) return null
  if (/暂无|无货|售罄|下柜|面议/.test(text)) return null

  const match = text.replace(/[,，\s]/g, '').match(/(\d+(?:\.\d{1,2})?)/)
  if (!match) return null
  const yuan = Number(match[1])
  if (!Number.isFinite(yuan) || yuan <= 0) return null
  return Math.round(yuan * 100)
}

/** 价格是否在合理量级（1 元 ~ 10 万元） */
export function isSanePrice(cents: number): boolean {
  return Number.isFinite(cents) && cents >= 100 && cents <= 10_000_000
}

/**
 * 是否疑似异常值（相对参考价偏离 >50%）。
 * 秒杀瞬时值会命中这里 —— 它不代表趋势，喂给中位数就够了，不必单独剔除。
 */
export function isSuspicious(cents: number, reference?: number): boolean {
  if (!reference || reference <= 0) return false
  return Math.abs(cents / reference - 1) > 0.5
}

/**
 * 取页面标题。
 *
 * 为什么要有它：整页扫描做特征判断会大量误判 —— 京东商品页正文里固定有 5 处「登录」链接，
 * 250 KB 的页面里也必然出现「404」字样。所以「登录墙 / 已下架」这类判断只对**标题**做，
 * 正文只用来抽价格。
 */
export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)
  return match ? match[1].trim() : ''
}

/** 判定文本（通常传页面标题）是否像「登录页 / 验证码页」 */
export function looksLikeAuthWall(text: string): boolean {
  if (!text) return false
  return /请先登录|扫码登录|安全验证|滑动验证|按住滑块|拖动滑块|访问受限|^登录|verify/i.test(text)
}

/** 判定文本（通常传页面标题）是否像「商品不存在 / 已下架」 */
export function looksLikeDelisted(text: string): boolean {
  if (!text) return false
  return /商品不存在|已下柜|已下架|页面不存在|出错了/i.test(text)
}

/** 把状态码翻译成一句人话（日志与调试用） */
export function statusText(status: number): string {
  switch (status) {
    case STATUS.OK: return 'ok'
    case STATUS.OUT_OF_STOCK: return '缺货'
    case STATUS.DELISTED: return '下架'
    case STATUS.FAILED: return '采集失败'
    case STATUS.SUSPICIOUS: return '疑似异常'
    default: return `未知(${status})`
  }
}
