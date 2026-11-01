import type { Category } from '../../constants'
import type { DigestModel } from '../model'

/** 一套主题要提供的三块：样式、表头、板块渲染 */
export interface Theme {
  key: ThemeKey
  name: string
  /** 主题整体色调，供能力判断与文字版使用 */
  tone: 'paper' | 'light' | 'dark'
  css: (width: number) => string
  render: (sheet: SheetModel) => string
}

export type ThemeKey = 'newspaper' | 'marble' | 'pixel'

export const THEME_KEYS: ThemeKey[] = ['newspaper', 'marble', 'pixel']

/** 一张图 = 一个品类（显卡 / 内存 / 固态） */
export interface SheetModel {
  digest: DigestModel
  category: Category
  categoryLabel: string
  /** 本品类全部型号（按价格降序） */
  items: SheetItem[]
  /** 本品类涨跌最猛的前几条 */
  movers: SheetItem[]
  /** 多个平台都有货、有价差的型号 */
  compare: Array<{ name: string; offers: Array<{ platform: string; price: number; shopName?: string }>; spread: number; lowest: string }>
  /** 品类指数 */
  index?: { value: number; change: number; q30: number; zone: string }
  width: number
  theme: ThemeKey
  title: string
  subtitle: string
  /** price=价格表；value=性价比榜；ladder=天梯图 */
  mode: SheetMode
}

export type SheetMode = 'price' | 'value' | 'ladder'

export interface SheetItem {
  modelId: string
  name: string
  price: number
  change: number
  d1: number
  pos: number
  label: string
  grade: string
  modifier: string
  confidence: string
  offers: Array<{ platform: string; price: number | null; shopName?: string }>
  trend: number[]
  /** 排行模式下的附加指标（性能分 / 每GB价格 / 天梯条） */
  metric?: { label: string; value: string; bar?: number; rank?: number }
}

// ── 格式化工具（三套主题共用，避免各自实现出不一致） ──

export function esc(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function yuan(cents: number): string {
  return '¥' + (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.00005) return '—'
  return (value > 0 ? '+' : '') + (value * 100).toFixed(digits) + '%'
}

export function arrow(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.00005) return '·'
  return value > 0 ? '▲' : '▼'
}

export function trendClass(value: number): 'up' | 'down' | 'flat' {
  if (!Number.isFinite(value) || Math.abs(value) < 0.00005) return 'flat'
  return value > 0 ? 'up' : 'down'
}

/** 极简 sparkline：用 div 高度画柱，不引入图表库 */
export function sparkbars(points: number[], height = 18): string {
  if (points.length < 2) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = Math.max(1, Math.floor(points.length / 16))
  const bars: string[] = []
  for (let i = 0; i < points.length; i += step) {
    const h = Math.round(2 + ((points[i] - min) / span) * (height - 2))
    bars.push(`<i style="height:${h}px"></i>`)
  }
  return `<span class="spark">${bars.join('')}</span>`
}

/** 平台名中文 */
export const PLATFORM_ZH: Record<string, string> = {
  jd: '京东',
  taobao: '淘宝',
  pdd: '拼多多',
  manual: '人工',
  mock: '演示',
  tmall: '天猫',
}
