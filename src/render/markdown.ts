import { money } from '../constants'
import type { DigestModel } from './model'

const GRADE_TEXT: Record<string, string> = {
  S: '长线低点', A: '低位', B: '常态', C: '高位', D: '高位风险',
}

function pct(r: number): string {
  if (Math.abs(r) < 0.0005) return '—'
  return `${r > 0 ? '▲' : '▼'}${(Math.abs(r) * 100).toFixed(1)}%`
}

/**
 * Markdown 渲染：给官方 QQ 机器人、Telegram、Discord、KOOK、Slack、Matrix 等支持 md 的平台用。
 * 与图片分支并列，不经过 HTML，也不依赖 markdown 解析库。
 */
export function renderMarkdown(model: DigestModel): string {
  const lines: string[] = []

  lines.push(`# ${model.period.title} · ${model.period.rangeText}`)
  lines.push('')
  lines.push(`采集 **${model.health.ok}/${model.health.total}**${model.health.failed ? ` · 失败 ${model.health.failed}` : ''}`)
  lines.push('')

  if (model.indexes.length) {
    lines.push('## 品类指数')
    lines.push('')
    lines.push(`| 品类 | 指数 | ${model.period.changeLabel} | 三十日分位 | 区间 |`)
    lines.push('| --- | ---: | ---: | ---: | --- |')
    for (const idx of model.indexes) {
      lines.push(`| ${idx.label} | ${idx.value.toFixed(1)} | ${pct(idx.change)} | ${(idx.q30 * 100).toFixed(0)}% | ${idx.zone} |`)
    }
    lines.push('')
  }

  if (model.movers.length) {
    lines.push(`## ${model.period.changeLabel}异动`)
    lines.push('')
    model.movers.forEach((item, i) => {
      lines.push(`**${i + 1}. ${item.name}**　${money(item.price)}　${pct(item.change)}`)
      lines.push('')
      const badge = `${item.grade} ${GRADE_TEXT[item.grade] ?? ''}`.trim()
      const extra = item.degrade ? item.degrade.detail : `置信度${item.confidence}`
      const streak = !item.degrade && Math.abs(item.streak) >= 2 ? ` · 连${item.streak > 0 ? '涨' : '跌'}${Math.abs(item.streak)}日` : ''
      lines.push(`> ${badge} · ${item.modifier} · ${extra}${streak}`)
      if (item.offers.length) {
        lines.push('>')
        lines.push('> ' + item.offers.map((o) => (o.price === null ? `${o.label} 缺货` : `${o.label} ${money(o.price)}`)).join('　'))
      }
      lines.push('')
    })
  }

  if (model.compare.length) {
    lines.push('## 比价机会')
    lines.push('')
    lines.push('| 型号 | 京东 | 淘宝 | 拼多多 | 价差 |')
    lines.push('| --- | ---: | ---: | ---: | ---: |')
    for (const row of model.compare) {
      const cell = (platform: string) => {
        const offer = row.items.find((o) => o.platform === platform)
        return offer && offer.price !== null ? money(offer.price) : '—'
      }
      lines.push(`| ${row.name} | ${cell('jd')} | ${cell('taobao')} | ${cell('pdd')} | ${(row.spread * 100).toFixed(1)}% |`)
    }
    lines.push('')
  }

  if (model.watch.length) {
    lines.push('## 我的关注')
    lines.push('')
    for (const item of model.watch) {
      lines.push(`- **${item.name}** ${money(item.price)} ${pct(item.change)} ${item.degrade ? item.degrade.detail : (GRADE_TEXT[item.grade] ?? '')}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(`数据 ${model.footer.quotes} 条 · 型号 ${model.footer.models} · 渲染 ${(model.footer.costMs / 1000).toFixed(1)}s`)

  return lines.join('\n')
}
