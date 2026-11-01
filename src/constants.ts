/** 全局常量与日期工具：零依赖，只用原生 Date */

export type Category = 'gpu' | 'ram' | 'ssd'

export const CATEGORIES: Category[] = ['gpu', 'ram', 'ssd']

export const CATEGORY_LABEL: Record<Category, string> = {
  gpu: '显卡',
  ram: '内存',
  ssd: 'SSD',
}

/** 快照状态码 */
export const STATUS = {
  OK: 0,
  OUT_OF_STOCK: 1,
  DELISTED: 2,
  FAILED: 3,
  SUSPICIOUS: 4,
} as const

export const DAY_MS = 86_400_000

/** 价格一律以「分」为整数单位存储，避免浮点 */
export function toCents(yuan: number): number {
  return Math.round(yuan * 100)
}

export function toYuan(cents: number): number {
  return cents / 100
}

/** Date → YYYYMMDD 整数（用本地时区，与用户看到的日期一致） */
export function toDay(date: Date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

/** YYYYMMDD → 当天 00:00 的 Date */
export function fromDay(day: number): Date {
  return new Date(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100)
}

/** a 比 b 晚多少天（a - b） */
export function diffDays(a: number, b: number): number {
  return Math.round((fromDay(a).getTime() - fromDay(b).getTime()) / DAY_MS)
}

/** day 往前推 n 天 */
export function shiftDay(day: number, n: number): number {
  return toDay(new Date(fromDay(day).getTime() + n * DAY_MS))
}

export function formatDay(day: number): string {
  const d = fromDay(day)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEKDAY[d.getDay()]}`
}

export const WEEKDAY = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 中文数字期号（第 001 期） */
export function issueNo(day: number, baseDay: number): string {
  const n = Math.max(1, diffDays(day, baseDay) + 1)
  return `第 ${String(n).padStart(3, '0')} 期`
}

/** 中位数（不改原数组） */
export function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** 截尾均值：去掉最高最低各一个（n≥3 时） */
export function trimmedMean(values: number[]): number {
  if (values.length <= 2) return median(values)
  const s = [...values].sort((a, b) => a - b).slice(1, -1)
  return s.reduce((a, b) => a + b, 0) / s.length
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

/** 样本标准差（n-1 分母，n<2 时返回 0） */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(v)
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

export function round(x: number, digits = 1): number {
  const p = 10 ** digits
  return Math.round(x * p) / p
}

/** 金额格式化：分 → ¥6,299 */
export function money(cents: number): string {
  // 内部按「分」存储，展示一律取整到元：真实商品价不会有角分
  return '¥' + String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 金额格式化（不带货币符号）：分 → 6,299 */
export function moneyPlain(cents: number): string {
  return money(cents).slice(1)
}
