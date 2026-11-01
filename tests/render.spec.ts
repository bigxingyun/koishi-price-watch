import { describe, expect, it } from 'vitest'

import { buildSheet, renderHtml } from '../src/render/themes'
import { renderMarkdown } from '../src/render/markdown'
import { renderText } from '../src/render/text'
import { parsePlatform, REPORT_META, type DigestModel } from '../src/render/model'
import { resolveMode, textLimitOf } from '../src/render/capability'
import type { Config } from '../src/index'

const model: DigestModel = {
  day: 20261031,
  dateText: '2026 年 10 月 31 日 星期六',
  issue: '第 001 期',
  period: {
    kind: 'weekly',
    label: '近 7 日',
    changeLabel: '本周',
    title: '硬件价格周报',
    startDay: 20261025,
    endDay: 20261031,
    rangeText: '2026 年 10 月 25 日 — 2026 年 10 月 31 日',
    platform: 'jd',
    platformLabel: '京东',
  },
  health: { total: 68, ok: 67, failed: 1 },
  indexes: [
    { category: 'gpu', label: '显卡', value: 96.4, change: -0.036, prevChange: -0.012, q30: 0.22, zone: '低位', r30: -0.051 },
    { category: 'ram', label: '内存', value: 118.7, change: 0.124, prevChange: 0.05, q30: 0.88, zone: '高位', r30: 0.092 },
  ],
  movers: [
    {
      modelId: 'gpu:rtx5070ti-16g', name: 'RTX 5070 Ti 16G', category: 'gpu',
      price: 629900, open: 679900, high: 679900, low: 619800,
      change: -0.072, prevChange: -0.02, d1: -0.02, pos: 0.17,
      streak: -3, label: '下跌', grade: 'S', modifier: '↓', confidence: '高', r30: -0.051, q30: 0.18,
      offers: [
        { platform: 'jd', label: '京东', price: 629900 },
        { platform: 'pdd', label: '拼多多', price: 619800 },
      ],
      trend: [679900, 674900, 669900, 664900, 659900, 649900, 629900],
    },
  ],
  compare: [
    {
      name: 'SN850X 1TB',
      items: [
        { platform: 'jd', label: '京东', price: 50400 },
        { platform: 'pdd', label: '拼多多', price: 50100 },
      ],
      spread: 0.049,
      lowest: '拼多多',
    },
  ],
  watch: [
    {
      modelId: 'ssd:990pro-2t', name: '990 PRO 2TB', category: 'ssd',
      price: 106200, open: 107000, high: 107500, low: 105000,
      change: -0.008, prevChange: 0.004, d1: -0.008, pos: 0.4,
      streak: 0, label: '横盘', grade: 'A', modifier: '→', confidence: '高', r30: -0.01, q30: 0.3,
      offers: [], trend: [107000, 106800, 106500, 106200],
    },
  ],
  footer: { models: 28, quotes: 67, costMs: 120 },
  theme: 'dark',
  colorScheme: 'cn',
}

const config = { advanced: { textLimit: 1800 }, basic: { markdownEnabled: false } } as unknown as Config

describe('三种形态内容对等', () => {
  it('都包含型号名、价格与涨跌', () => {
    for (const output of [renderText(model), renderMarkdown(model), renderHtml(buildSheet(model, 'gpu', '显卡', 'newspaper', 960))]) {
      expect(output).toContain('RTX 5070 Ti 16G')
      expect(output).toContain('6,299')
      expect(output).toContain('7.2%')
    }
  })

  it('都带周期标题与平台标注（周报 · 京东）', () => {
    expect(renderText(model)).toContain('硬件价格周报')
    expect(renderMarkdown(model)).toContain('硬件价格周报')
    const html = renderHtml(buildSheet(model, 'gpu', '显卡', 'newspaper', 960))
    expect(html).toContain('硬件价格周报')
    expect(html).toContain('京东')
  })

})

describe('renderText', () => {
  it('超长时按优先级裁剪，不会硬切坏结构', () => {
    const text = renderText(model, 120)
    expect(text.length).toBeLessThanOrEqual(120)
    expect(text).toContain('硬件价格周报')
  })

  it('没有比价与关注时不出现空段落', () => {
    const text = renderText({ ...model, compare: [], watch: [] })
    expect(text).not.toContain('【比价机会】')
    expect(text).not.toContain('【我的关注】')
  })
})

describe('renderMarkdown', () => {
  it('品类指数是标准 markdown 表格', () => {
    const md = renderMarkdown(model)
    expect(md).toContain('| 品类 | 指数 |')
    expect(md).toContain('| --- | ---: |')
  })
})

describe('renderHtml（报纸模板）', () => {
  const html = renderHtml(buildSheet(model, 'gpu', '显卡', 'newspaper', 960))

  it('包含报头、期号与周期标题', () => {
    expect(html).toContain('硬件价格周报')
    expect(html).toContain('第 001 期')
  })

  it('零外部资源：不引用任何 http(s) 地址', () => {
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('不用 emoji（Linux 容器常缺 emoji 字体）', () => {
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })


})

describe('周期与平台解析', () => {
  it('三个周期的窗口天数正确', () => {
    expect(REPORT_META.daily.windowDays).toBe(1)
    expect(REPORT_META.weekly.windowDays).toBe(7)
    expect(REPORT_META.monthly.windowDays).toBe(30)
  })

  it('平台别名中英文都能认', () => {
    expect(parsePlatform('京东')).toBe('jd')
    expect(parsePlatform('jd')).toBe('jd')
    expect(parsePlatform('天猫')).toBe('taobao')
    expect(parsePlatform('拼多多')).toBe('pdd')
    expect(parsePlatform(undefined)).toBe('all')
    expect(parsePlatform('全平台')).toBe('all')
  })
})

describe('platform capability', () => {
  it('文本上限统一走一个配置项', () => {
    expect(textLimitOf(config)).toBe(1800)
  })

  it('auto 模式按能力表选择，未知平台退回图片或文本', () => {
    const autoConfig = { basic: { markdownEnabled: false } } as unknown as Config
    expect(resolveMode('qq', 'auto', autoConfig)).toBe('image')
    expect(resolveMode('telegram', 'auto', autoConfig)).toBe('image')
    autoConfig.basic.markdownEnabled = true
    expect(resolveMode('telegram', 'auto', autoConfig)).toBe('markdown')
    expect(resolveMode('onebot', 'auto', autoConfig)).toBe('image')
  })

  it('显式指定 markdown 但开关关闭时自动降级', () => {
    const offConfig = { basic: { markdownEnabled: false } } as unknown as Config
    expect(resolveMode('telegram', 'markdown', offConfig)).toBe('image')
  })
})
