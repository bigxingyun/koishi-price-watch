import { Context, h, type Fragment, Session } from 'koishi'

import { CATEGORY_LABEL, money, type Category } from '../constants'
import { buildValueRows } from '../render/image'
import { scoreOfGpu } from '../stats/bench'
import type { Config } from '../index'
import { buildDigest, parsePlatform, seriesOf, type PlatformFilter, type ReportKind } from '../render/model'
import { renderLadderSheet, renderSheets, renderValueSheet } from '../render/image'
import type { ThemeKey } from '../render/themes'
import { HELP, unknown } from '../text/zh'
import { subscribeModel, unsubscribeModel } from '../service/offers'
import { renderMarkdown } from '../render/markdown'
import { renderText } from '../render/text'
import * as repo from '../store/repo'
import { resolveMode as resolveCapabilityMode } from '../render/capability'
import { both } from './register'

const GRADE_TEXT: Record<string, string> = {
  S: '长线低点', A: '低位', B: '常态', C: '高位', D: '高位风险',
}

const PLATFORM_ZH: Record<string, string> = { jd: '京东', taobao: '淘宝', pdd: '拼多多', manual: '人工', mock: '演示' }

function pct(value: number): string {
  if (Math.abs(value) < 0.0005) return '—'
  return `${value > 0 ? '▲' : '▼'}${(Math.abs(value) * 100).toFixed(1)}%`
}

export interface Scope {
  platform: string
  channelId: string
  userId: string
}

export function scopeOf(session: Session | undefined): Scope | null {
  const channelId = session?.channelId
  if (!session || !channelId) return null
  return { platform: session.platform, channelId, userId: session.userId ?? '' }
}

/** 中文品类别名 */
export function parseCategory(input?: string): Category | undefined {
  if (!input) return undefined
  const text = input.trim().toLowerCase()
  if (['gpu', '显卡', '卡'].includes(text)) return 'gpu'
  if (['ram', '内存', '内存条'].includes(text)) return 'ram'
  if (['ssd', '固态', '硬盘', '固态硬盘'].includes(text)) return 'ssd'
  return undefined
}

// ── 业务处理 ──────────────────────────────────────

export async function handleQuery(ctx: Context, config: Config, query?: string): Promise<string> {
  if (!query) {
    return [
      '用法：`价格 5070ti`（换成你在盯的型号）',
      '报表：`价格 日报` / `价格 周报` / `价格 月报`（可加平台名，如 `价格 日报 京东`）',
      '全部用法：`价格 帮助`',
    ].join('\n')
  }
  const matches = await repo.searchModels(ctx, query, 3)
  if (!matches.length) return `没有匹配「${query}」的型号，用「价格 型号」看看型号库`
  if (matches.length > 1 && matches[1].score >= matches[0].score - 6) {
    return ['匹配到多个型号，请说得更具体些：', ...matches.map((m) => `· ${m.model.name}`)].join('\n')
  }

  const model = matches[0].model
  const stat = await repo.getStat(ctx, model.id)
  if (!stat) return `${model.name} 还没有采集数据`

  const lines = [
    `${model.name}　${money(stat.price)}　${pct(stat.d1)}`,
    `七日 ${pct(stat.r7)}　位置 ${(stat.pos7 * 100).toFixed(0)}%　${stat.label7}${Math.abs(stat.streak) >= 2 ? `　连${stat.streak > 0 ? '涨' : '跌'}${Math.abs(stat.streak)}日` : ''}`,
  ]
  if (stat.n30 >= 21) {
    lines.push(`三十日 ${stat.grade} ${GRADE_TEXT[stat.grade] ?? ''} ${stat.modifier}　分位 ${(stat.q30 * 100).toFixed(0)}%　置信度${stat.confidence}`)
  } else {
    lines.push(`长期数据积累中 ${stat.n30}/30 日`)
  }
  lines.push(`数据日 ${stat.day}`)

  const offers = (await repo.listOffers(ctx, model.id)).filter((o) => o.active)
  if (offers.length > 1) {
    lines.push(`已绑定：${offers.map((o) => PLATFORM_ZH[o.platform] ?? o.platform).join(' / ')}`)
  }
  return lines.join('\n')
}

export async function handleTrend(
  ctx: Context,
  config: Config,
  query?: string,
  days?: number,
  platformInput?: string,
): Promise<string> {
  if (!query) return '用法：`价格 趋势 5070ti`，可加天数：`价格 趋势 5070ti 60`'
  const matches = await repo.searchModels(ctx, query, 1)
  if (!matches.length) return `没有匹配「${query}」的型号`
  const model = matches[0].model
  const span = Math.min(90, Math.max(7, days ?? 30))
  const platform = parsePlatform(platformInput)
  const points = await seriesOf(ctx, model.id, span, platform)
  if (!points.length) return `${model.name} 还没有价格历史`

  const min = Math.min(...points)
  const max = Math.max(...points)
  const label = platform === 'all' ? '' : `（${PLATFORM_ZH[platform] ?? platform}）`
  return [
    `${model.name}${label}　近 ${points.length} 日`,
    sparkline(points),
    `最低 ${money(min)}　最高 ${money(max)}　现价 ${money(points[points.length - 1])}`,
  ].join('\n')
}

export async function handleList(ctx: Context, config: Config, category?: string): Promise<string> {
  const models = await repo.listModels(ctx, parseCategory(category))
  if (!models.length) return '型号库为空：用「价格 管理 演示」灌一份数据，或 price admin preset --import 导入内置型号'
  const stats = await repo.getAllStats(ctx)
  const statMap = new Map(stats.map((s) => [s.modelId, s]))
  const lines = models.map((model) => {
    const stat = statMap.get(model.id)
    return `${CATEGORY_LABEL[model.category as Category] ?? model.category}　${model.name}　${stat ? money(stat.price) : '—'}　${stat ? pct(stat.r7) : ''}`
  })
  const pageSize = 12
  if (lines.length <= pageSize) return lines.join('\n')
  return `${lines.slice(0, pageSize).join('\n')}\n…… 共 ${lines.length} 个，可用「价格 型号 显卡 / 内存 / SSD」缩小范围`
}

export async function handleTop(ctx: Context, config: Config, count?: number): Promise<string> {
  const n = Math.min(10, Math.max(1, count ?? 5))
  const stats = await repo.getAllStats(ctx)
  const models = await repo.listModels(ctx)
  const nameMap = new Map(models.map((m) => [m.id, m.name]))
  const top = [...stats]
    .filter((s) => s.n30 >= 1)
    .sort((a, b) => Math.abs(b.r7) - Math.abs(a.r7))
    .slice(0, n)
  if (!top.length) return '还没有足够数据'
  return top.map((s, i) => `${i + 1}. ${nameMap.get(s.modelId) ?? s.modelId}　${money(s.price)}　${pct(s.r7)}`).join('\n')
}

export async function handleSubscribe(ctx: Context, scope: Scope | null, query?: string): Promise<string> {
  if (!scope || !query) return '用法：`价格 关注 加 5070ti`'
  const matches = await repo.searchModels(ctx, query, 1)
  if (!matches.length) return `没有匹配「${query}」的型号`
  const model = matches[0].model
  const added = await subscribeModel(ctx, scope, model.id)
  return added ? `已订阅 ${model.name}，之后报表的「我的关注」里会出现` : `${model.name} 已经在关注列表里`
}

export async function handleUnsubscribe(ctx: Context, scope: Scope | null, query?: string): Promise<string> {
  if (!scope || !query) return '用法：`价格 关注 删 5070ti`'
  const matches = await repo.searchModels(ctx, query, 1)
  if (!matches.length) return `没有匹配「${query}」的型号`
  const model = matches[0].model
  const removed = await unsubscribeModel(ctx, scope, model.id)
  return removed ? `已取消订阅 ${model.name}` : `${model.name} 不在关注列表里`
}

export async function handleSubList(ctx: Context, scope: Scope | null): Promise<string> {
  if (!scope) return '当前会话不可用'
  const subs = await repo.listSubs(ctx, scope.platform, scope.channelId)
  if (!subs.length) return '本会话还没有订阅，用「价格 关注 加 型号」添加'
  const models = await repo.listModels(ctx)
  const nameMap = new Map(models.map((m) => [m.id, m.name]))
  return subs.map((s) => `· ${nameMap.get(s.modelId) ?? s.modelId}`).join('\n')
}

export interface ReportRequest {
  kind: ReportKind
  platform?: PlatformFilter | string
  image?: boolean
  markdown?: boolean
  /** 主题覆盖（不传则用配置里的默认主题） */
  theme?: ThemeKey
  /** 没显式指定形态时，按配置里的默认形态决定 */
  auto?: boolean
}

export async function handleReport(
  ctx: Context,
  config: Config,
  session: Session | undefined,
  request: ReportRequest,
): Promise<Fragment> {
  const scope = scopeOf(session)
  const watchIds = scope
    ? await repo.resolveWatchIds(ctx, scope.platform, scope.channelId, config.basic.maxWatchItems)
    : []
  const platform = typeof request.platform === 'string'
    ? parsePlatform(request.platform)
    : (request.platform ?? 'all')

  const digest = await buildDigest(ctx, config, { kind: request.kind, platform, watchIds })

  // 没显式指定形态时，跟随配置「常规 → 报表默认长什么样」
  let image = !!request.image
  let markdown = !!request.markdown
  if (request.auto) {
    const picked = resolveCapabilityMode(session?.platform, config.basic.mode, config)
    image = picked === 'image'
    markdown = picked === 'markdown'
  }

  if (image) {
    try {
      // 一个品类一张图：显卡 / 内存 / 固态分开出，不挤在一张长图里
      const sheets = await renderSheets(ctx, config, digest, request.theme)
      if (!sheets.length) return '没有可出图的数据（先采集，或用「价格 管理 演示」灌一份）'
      return sheets.map((sheet) => h.image(sheet.buffer, sheet.mime))
    } catch (error) {
      // 失败必须说清楚原因：静默退回文本会让人以为「图片功能没做」
      return `图片渲染失败：${(error as Error).message}\n\n以下是文本版：\n\n${renderText(digest, 1500)}`
    }
  }
  if (markdown) return renderMarkdown(digest)
  return renderText(digest, config.advanced.textLimit)
}

export function sparkline(points: number[], width = 24): string {
  if (points.length < 2) return ''
  const chars = '▁▂▃▄▅▆▇█'
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = Math.max(1, Math.floor(points.length / width))
  let out = ''
  for (let i = 0; i < points.length; i += step) {
    const level = Math.round(((points[i] - min) / range) * (chars.length - 1))
    out += chars[level]
  }
  return out
}

/** 主题解析：不认识的值明确报错，不静默退回报纸 */
function parseTheme(input?: string): { value?: ThemeKey } | { error: string } {
  if (!input) return {}
  const key = input.trim().toLowerCase()
  const map: Record<string, ThemeKey> = {
    newspaper: 'newspaper', '报纸': 'newspaper', paper: 'newspaper',
    marble: 'marble', '大理石': 'marble', greek: 'marble',
    pixel: 'pixel', '像素': 'pixel', geek: 'pixel',
  }
  const hit = map[key]
  if (!hit) return { error: unknown.theme(input) }
  return { value: hit }
}
/** 形态解析：不认识的值要报错，不能静默退回文本 */
function resolveMode(options?: { image?: boolean; markdown?: boolean; mode?: string }) {
  const raw = options?.mode?.trim().toLowerCase()
  if (raw && !['text', 'image', 'markdown'].includes(raw)) {
    return { error: unknown.mode(String(options?.mode)) }
  }
  if (raw === 'image') return { image: true, markdown: false }
  if (raw === 'markdown') return { image: false, markdown: true }
  if (raw === 'text') return { image: false, markdown: false }
  return { image: !!options?.image, markdown: !!options?.markdown }
}

// ── 用户指令树：根只有 price 一个 ──────────────────

export function mountPriceCommands(ctx: Context, config: Config) {
  ctx.command('price [query:text]', '查硬件价格、出报表、订阅关注')
    .alias('价格', 'p')
    .usage('例：价格 5070ti　/　价格 日报 京东 -i　/　价格 帮助')
    .action(async ({}, query) => handleQuery(ctx, config, query))

  const report = (kind: ReportKind) => (cmd: ReturnType<typeof ctx.command>) => cmd
    .option('image', '-i, --image 输出图片')
    .option('markdown', '-m, --markdown 输出 Markdown')
    .option('mode', '--mode <mode:string> 形态：text / image / markdown')
    .option('theme', '--theme <theme:string> 主题：newspaper / marble / pixel')
    .action(async ({ session, options }: { session: Session; options: { image?: boolean; markdown?: boolean; mode?: string; theme?: string } }, platform?: string) => {
      const picked = resolveMode(options)
      if ('error' in picked) return picked.error
      const theme = parseTheme(options?.theme)
      if ('error' in theme) return theme.error
      return handleReport(ctx, config, session, {
        kind,
        platform,
        image: picked.image,
        markdown: picked.markdown,
        theme: theme.value,
        auto: !options?.image && !options?.markdown && !options?.mode,
      })
    })

  both(ctx, ['price.daily', 'price.日报'], '今日报表（可加平台名）', report('daily'))
  both(ctx, ['price.weekly', 'price.周报'], '近 7 日报表（可加平台名）', report('weekly'))
  both(ctx, ['price.monthly', 'price.月报'], '近 30 日报表（可加平台名）', report('monthly'))

  both(ctx, ['price.trend', 'price.趋势'], '价格走势',
    (cmd) => cmd.action(async ({}, query?: string, days?: number, platform?: string) => handleTrend(ctx, config, query, days, platform)))

  both(ctx, ['price.top', 'price.排行'], '涨跌最猛的前几名',
    (cmd) => cmd.action(async ({}, count?: number) => handleTop(ctx, config, count)))

  both(ctx, ['price.list', 'price.型号'], '型号库',
    (cmd) => cmd.action(async ({}, category?: string) => handleList(ctx, config, category)))

  both(ctx, ['price.watch', 'price.关注'], '订阅管理',
    (cmd) => cmd.action(() => '用法：价格 关注 加 「型号」 / 删 「型号」 / 列表'))

  both(ctx, ['price.watch.add', 'price.关注.加'], '订阅型号',
    (cmd) => cmd.action(async ({ session }, query?: string) => handleSubscribe(ctx, scopeOf(session), query)))

  both(ctx, ['price.watch.remove', 'price.关注.删'], '取消订阅',
    (cmd) => cmd.action(async ({ session }, query?: string) => handleUnsubscribe(ctx, scopeOf(session), query)))

  both(ctx, ['price.watch.list', 'price.关注.列表'], '查看订阅',
    (cmd) => cmd.action(async ({ session }) => handleSubList(ctx, scopeOf(session))))

  // 兼容旧入口
  const legacy = (cmd: ReturnType<typeof ctx.command>) => cmd
    .option('image', '-i, --image 输出图片')
    .option('markdown', '-m, --markdown 输出 Markdown')
    .option('mode', '--mode <mode:string> 形态：text / image / markdown')
    .action(async ({ session, options }: { session: Session; options: { image?: boolean; markdown?: boolean; mode?: string } }, kind?: string, platform?: string) => {
      const picked = resolveMode(options)
      if ('error' in picked) return picked.error
      const text = (kind ?? 'daily').toLowerCase()
      const reportKind: ReportKind = text.startsWith('w') || text.includes('周') ? 'weekly'
        : text.startsWith('m') || text.includes('月') ? 'monthly' : 'daily'
      return handleReport(ctx, config, session, { kind: reportKind, platform, image: picked.image, markdown: picked.markdown })
    })
  legacy(ctx.command('price.report [kind:string] [platform:string]', '生成报表（旧入口）'))
  legacy(ctx.command('price.digest [kind:string] [platform:string]', '生成日报（旧名）'))

  // ── 性价比榜 ────────────────────────────────
  both(ctx, ['price.value', 'price.性价比'], '性价比榜（显卡看每百元性能，内存固态看每GB价格）',
    (cmd) => cmd
      .option('text', '-t, --text 输出文本')
      .option('theme', '--theme <theme:string> 主题：newspaper / marble / pixel')
      .action(async ({ session, options }, categoryInput?: string) => {
        const category = parseCategory(categoryInput) ?? 'gpu'
        const digest = await buildDigest(ctx, config, { kind: 'daily', platform: 'all' })
        if (options?.text) {
          const rows = buildValueRows(digest, category)
          if (!rows.length) return `没有可排行的${CATEGORY_LABEL[category]}数据`
          const sorted = [...rows].sort((a, b) => (a.higherIsBetter ? b.value - a.value : a.value - b.value))
          return [
            `${CATEGORY_LABEL[category]}性价比榜：`,
            ...sorted.slice(0, 15).map((row, i) =>
              `${i + 1}. ${row.name}　${money(row.price * 100)}　${row.higherIsBetter ? row.metric + ' 分' : row.metric + 'G'}　${row.value.toFixed(1)} ${row.unit}`),
          ].join('\n')
        }
        try {
          const theme = parseTheme(options?.theme)
          if ('error' in theme) return theme.error
          const sheet = await renderValueSheet(ctx, config, digest, category, theme.value)
          return [h.image(sheet.buffer, sheet.mime)]
        } catch (error) {
          return `性价比榜出图失败：${(error as Error).message}`
        }
      }))

  // ── 显卡天梯图 ──────────────────────────────
  both(ctx, ['price.ladder', 'price.天梯'], '显卡性能天梯图',
    (cmd) => cmd
      .option('text', '-t, --text 输出文本')
      .option('theme', '--theme <theme:string> 主题：newspaper / marble / pixel')
      .action(async ({ options }) => {
        const digest = await buildDigest(ctx, config, { kind: 'daily', platform: 'all' })
        if (options?.text) {
          const rows = digest.items
            .filter((item) => item.category === 'gpu')
            .map((item) => ({ name: item.name, score: scoreOfGpu(item.name) ?? 0 }))
            .filter((row) => row.score > 0)
            .sort((a, b) => b.score - a.score)
          if (!rows.length) return '没有认出任何显卡型号的性能分'
          const top = rows[0].score
          return ['显卡性能天梯（参考分）：', ...rows.map((row, i) =>
            `${String(i + 1).padStart(2, ' ')}. ${row.name.padEnd(16, ' ')} ${'█'.repeat(Math.round((row.score / top) * 20))} ${row.score}`)].join('\n')
        }
        try {
          const theme = parseTheme(options?.theme)
          if ('error' in theme) return theme.error
          const sheet = await renderLadderSheet(ctx, config, digest, theme.value)
          return [h.image(sheet.buffer, sheet.mime)]
        } catch (error) {
          return `天梯图出图失败：${(error as Error).message}`
        }
      }))
  both(ctx, ['price.help', 'price.帮助'], '中文速查表', (cmd) => cmd.action(() => HELP))
}