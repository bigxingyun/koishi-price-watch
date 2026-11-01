/**
 * 从商品链接 / 纯 ID 里解析平台 itemId，并校验它「像不像真的 ID」。
 *
 * 单独成文件是为了「可测试」：它是纯函数，不该被指令模块拖上整个 koishi 运行时。
 *
 * 血的教训：以前是「从任意字符串里抠第一段 6 位以上数字」，
 * 于是 `mock-900007` 被当成京东商品 ID、`pdd-gpu:rtx5090-32g` 被直接拼进
 * `goods.html?goods_id=`，页面只会回「商品不存在」。
 */

/** 各平台真实商品 ID 的形态：京东/淘宝是纯数字，拼多多是更长的纯数字 */
const ID_RULES: Record<string, RegExp> = {
  jd: /^\d{6,}$/,
  taobao: /^\d{6,}$/,
  pdd: /^\d{8,}$/,
}

/** 从**链接**里取 ID 的规则（只认各平台自己的商品页） */
const URL_RULES: Record<string, RegExp> = {
  jd: /item\.(?:m\.)?jd\.com\/(?:product\/)?(\d{6,})/,
  pdd: /goods_id=(\d{6,})/,
  taobao: /[?&](?:id|itemId)=(\d{6,})/,
}

export function isValidItemId(platform: string, itemId: string | undefined | null): boolean {
  if (!itemId) return false
  const rule = ID_RULES[platform]
  if (!rule) return itemId.trim().length > 0
  return rule.test(itemId.trim())
}

export function describeInvalidId(platform: string, itemId: string): string {
  const zh = platform === 'pdd' ? '拼多多' : platform === 'jd' ? '京东' : platform === 'taobao' ? '淘宝' : platform
  const rule = ID_RULES[platform]
  if (!rule) return `「${itemId}」不是有效的商品 ID`
  const example = platform === 'pdd' ? '例如 123456789012' : '例如 100012043978'
  return `「${itemId}」不是${zh}的商品 ID（应是纯数字，${example}）`
}

export function extractItemId(platform: string, input: string): string | null {
  const text = input.trim()
  if (!text) return null

  // 1. 纯 ID
  if (/^\d{6,}$/.test(text)) return isValidItemId(platform, text) ? text : null

  // 2. 各平台商品链接
  const urlRule = URL_RULES[platform]
  if (urlRule) {
    const match = text.match(urlRule)
    return match ? match[1] : null
  }

  // 3. 没有专用规则的平台（manual / mock）：非空即接受
  return text
}
