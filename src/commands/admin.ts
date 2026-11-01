import { Context, h, type Command } from 'koishi'

import { CATEGORY_LABEL, money, toCents, toDay, type Category } from '../constants'
import type { Config } from '../index'
import { authReport, confirmLogin, getAuthState, requestLogin, setAuthState, verifyLogin } from '../auth/login'
import { advanceWizard, cancelWizard, getWizard, startSingle, startWizard, wizardStatus } from '../auth/wizard'
import { runLoginSelfCheck } from '../auth/selfcheck'
import { runCollect } from '../crawler/collect'
import { getCount, isBlocked, unblock } from '../crawler/guard'
import { listPlatforms } from '../adapters'
import { setManualPrice } from '../adapters/manual'
import { pushAlerts } from '../notify/alert'
import { gc, stats as tableStats } from '../store/gc'
import { seedDemo } from '../dev/demo'
import { rebuildAll } from '../store/aggregate'
import { diffPreset, importPreset } from '../store/preset'
import { hasCjkFont, fontHint } from '../render/font'
import * as repo from '../store/repo'
import { adminHint, ensureAdmin, isTrustedPlatform } from '../util/auth'
import { describeInvalidId, extractItemId, isValidItemId } from '../util/itemId'
import { queueSearch, searchPlatform } from '../crawler/search'
import { normalizePlatform, platformChoices } from '../util/platform'
import { usage } from '../text/zh'
import { offerUrl, probePage } from '../crawler/probe'
import { addPushTarget, bindOffer, recordManualPrice, removePushTarget } from '../service/offers'
import { buildDebugReport, debugSummary } from '../service/debug'
import { describeSimulate, discoverBySimulation } from '../service/simulate'
import { describeIngest, ingestQuotes } from '../service/ingest'
import { probePlatform } from '../service/probe'
import { qualityLine, qualitySummary } from '../service/quality'
import { antiLines, antiReport } from '../anti'
import { both } from './register'

/** 环境与数据自检 */
export async function runDoctor(ctx: Context, config: Config, ready: boolean): Promise<string> {
  const checks: string[] = []
  const ok = (name: string, detail: string) => checks.push(`✅ ${name}：${detail}`)
  const bad = (name: string, detail: string) => checks.push(`❌ ${name}：${detail}`)

  ok('数据库', '可用')
  ok('http 服务', typeof ctx.http === 'function' ? '可用' : '缺失（采集会失败）')
  ok('插件就绪', ready ? '是' : '否')

  if (hasCjkFont()) ok('中文字体', '可用')
  else bad('中文字体', fontHint())

  if (!config.collect.browserEnabled) {
    checks.push('⚠ 浏览器采集：未开启（图片渲染仍可用；京东/淘宝/拼多多采集会跳过）')
  } else {
    try {
      const { withRenderPage } = await import('../crawler/browser')
      await withRenderPage(ctx, config, async (page) => {
        await page.setContent('<h1>ok</h1>')
      })
      ok('浏览器', '可启动')
    } catch (error) {
      bad('浏览器', (error as Error).message)
    }
  }

  const tables = await tableStats(ctx)
  checks.push(`📊 数据量：${tables.map((t) => `${t.table} ${t.rows}`).join(' · ')}`)

  const offers = await repo.listOffers(ctx)
  // 固定检查三家平台：只统计「有报价的平台」会让没用过的平台彻底隐身
  const platforms = ['pdd', 'jd', 'taobao']
  if (!platforms.length) {
    checks.push('⚠ 报价：还没有绑定商品链接（价格 管理 绑定 「型号」 <平台> <链接>）')
  }
  for (const platform of platforms) {
    const stored = await getAuthState(ctx, platform)
    const block = await isBlocked(ctx, platform)
    const count = await getCount(ctx, platform)

    // 关键：登录态必须**实测**，不能拿库里存的标记当事实。
    // 之前这里打印的是 meta 里的 ok，但实际抓取早就被踢回登录页 —— 自检在撒谎。
    const live = config.collect.browserEnabled
      ? await verifyLogin(ctx, config, platform).catch(() => null)
      : null

    if (live) {
      const storedOk = stored === 'ok'
      if (live.loggedIn !== storedOk) {
        // 自愈：以实测为准，修正记录
        await setAuthState(ctx, platform, live.loggedIn ? 'ok' : 'expired')
        checks.push(`⚠ ${platform}：记录是 ${storedOk ? '已登录' : '未登录'}，实测是 ${live.loggedIn ? '已登录' : '未登录'}，已按实测修正`)
      }
    }

    const stateText = live ? (live.loggedIn ? '已登录' : '未登录') : `记录=${stored}`
    const parts = [`登录=${stateText}`, `今日请求 ${count}/${config.collect.dailyCap}`]
    if (block.blocked) parts.push(`熔断至 ${block.until?.toLocaleString()}（${block.reason}）`)
    checks.push(`${block.blocked ? '⛔' : live?.loggedIn ? '✅' : '·'} ${platform}：${parts.join('、')}`)
    if (live && !live.loggedIn) checks.push(`   原因：${live.detail}`)
  }

  const targets = await repo.listTargets(ctx)
  checks.push(targets.length
    ? `📮 推送目标 ${targets.length} 个：${targets.map((t) => `${t.platform}/${t.kind}`).join('、')}`
    : '⚠ 推送目标：还没有（价格 管理 推送 加）')

  // 数据质量：采集结论按状态聚合，失败原因一并列出
  const quality = await qualitySummary(ctx)
  checks.push(qualityLine(quality))
  for (const failure of quality.lastFailures.slice(0, 3)) {
    checks.push(`  · ${failure.platform} 最近失败：${failure.reason.slice(0, 60)}`)
  }

  const anti = await antiReport(ctx, config)
  checks.push(...antiLines(anti))

  const models = await repo.listModels(ctx)
  const stats = await repo.getAllStats(ctx)
  checks.push(`🧮 型号 ${models.length} 个，已有指标 ${stats.length} 个`)
  return checks.join('\n')
}

/**
 * 管理指令树：`price admin *` 与 `价格 管理 *` 各注册一份。
 * 两级中文名（如「管理 推送 加」）需要逐层注册，否则 Koishi 无法解析。
 */
export function mountAdmin(ctx: Context, config: Config, isReady: () => boolean) {
  const logger = ctx.logger('price-watch')
  const parents = [
    ctx.command('price.admin', '管理指令').alias('管理'),
  ]
  void parents

  const guard = async (session: Parameters<typeof ensureAdmin>[1]) => {
    if (await ensureAdmin(ctx, session, config)) return null
    return adminHint(session)
  }

  const cmd = (names: [string, string], desc: string, setup: (c: Command) => void) =>
    both(ctx, names, desc, (c) => {
      setup(c)
    })

  // ── 绑定主人：控制台出秘钥 → 聊天里确认 ────────
  cmd(['price.admin.claim', 'price.管理.绑定主人'], '生成一次性秘钥（会打印到 Koishi 控制台）', (c) => c
    .action(async () => {
      const token = Math.random().toString(36).slice(2, 8).toUpperCase()
      const expires = Date.now() + 10 * 60 * 1000
      await repo.metaSet(ctx, 'owner:token', JSON.stringify({ token, expires }))
      // 只打到控制台：能看到日志的人就是宿主，等于持有一把钥匙
      logger.warn('==============================')
      logger.warn('  绑定主人秘钥：%s（10 分钟内有效）', token)
      logger.warn('  在聊天里发：价格 管理 确认绑定 %s', token)
      logger.warn('==============================')
      return [
        '已生成一次性秘钥，**请到 Koishi 控制台查看**（日志里那六位）。',
        '',
        '拿到后发：价格 管理 确认绑定 「秘钥」',
        '',
        '为什么这样设计：秘钥只打印在控制台，能看到日志的人才是这台机器的主人。',
      ].join('\n')
    }))

  cmd(['price.admin.claimConfirm', 'price.管理.确认绑定'], '用秘钥完成主人绑定', (c) => c
    .action(async (argv, input?: string) => {
      if (!input) return '用法：价格 管理 确认绑定 「控制台里的秘钥」'
      const raw = await repo.metaGet(ctx, 'owner:token').catch(() => null)
      if (!raw) return '没有待用的秘钥。先发：价格 管理 绑定主人'
      let record: { token?: string; expires?: number } = {}
      try { record = JSON.parse(raw) } catch { record = {} }
      if (!record.token || (record.expires ?? 0) < Date.now()) {
        await repo.metaDel(ctx, 'owner:token').catch(() => undefined)
        return '秘钥已过期。重新发：价格 管理 绑定主人'
      }
      if (record.token !== input.trim().toUpperCase()) {
        return '秘钥不对。看错了吗？再试一次，或重新生成。'
      }
      const session = argv.session
      if (!session?.userId) return '拿不到你的用户 ID，无法绑定。'
      const key = `${session.platform}:${session.userId}`
      const { addOwner } = await import('../util/auth')
      await addOwner(ctx, key)
      await repo.metaDel(ctx, 'owner:token').catch(() => undefined)
      return [
        `✅ 已绑定主人：${key}`,
        '',
        '之后你在这个平台的账号可以直接用全部管理指令，重启也不会丢。',
      ].join('\n')
    }))

  // ── 我是谁：告诉用户该往 owners 里填什么 ──────
  cmd(['price.admin.whoami', 'price.管理.我是谁'], '看自己的平台与用户ID（配置 owners 用）', (c) => c
    .action((argv) => {
      const session = argv.session
      if (!session) return '拿不到会话信息'
      const trusted = isTrustedPlatform(session.platform)
      return [
        '你的会话信息：',
        `  平台：${session.platform}`,
        `  用户ID：${session.userId ?? '（空）'}`,
        `  频道ID：${session.channelId ?? '（私聊）'}`,
        `  机器人：${session.selfId}`,
        `  权限等级：${(session.user as { authority?: number } | undefined)?.authority ?? 0}`,
        '',
        `要填进「主人身份」的值：${session.platform}:${session.userId ?? '?'}`,
        trusted
          ? '（当前是沙盒/测试平台，默认就放行，不用填）'
          : '（填这一个就能让我认你作主人）',
      ].join('\n')
    }))

  // ── 数据源（混合模式：api / browser / manual） ──
  cmd(['price.admin.source', 'price.管理.数据源'], '查看或切换数据源（api / browser / manual）', (c) => c
    .action(async (argv, platform?: string, mode?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied

      const { setSource, sourceTable } = await import('../collect/source')
      const { apiReady } = await import('../api')
      const normalize = (raw: string) => {
        const key = raw.toLowerCase()
        return normalizePlatform(raw) ?? key
        return key
      }

      if (platform && mode) {
        const target = normalize(platform)
        const wanted = mode.toLowerCase()
        const map: Record<string, 'auto' | 'api' | 'browser' | 'manual'> = {
          auto: 'auto', '自动': 'auto',
          api: 'api', '接口': 'api',
          browser: 'browser', '爬虫': 'browser', '浏览器': 'browser',
          manual: 'manual', '人工': 'manual', '关闭': 'manual',
        }
        const picked = map[wanted]
        if (!picked) return `不认识的数据源「${mode}」，可选：api / browser / manual / auto`
        if (picked === 'api' && !apiReady(config, target)) {
          return `${platform} 还没配联盟密钥，切到 api 也调不通。\n先填配置里的 api.${target}，或用 browser。`
        }
        await setSource(ctx, target, picked)
        const decision = await (await import('../collect/source')).resolveSource(ctx, config, target)
        return `已把 ${platform} 的数据源设为 ${picked}（生效：${decision.source} —— ${decision.reason}）`
      }

      const table = await sourceTable(ctx, config)
      const zh: Record<string, string> = { jd: '京东', pdd: '拼多多', taobao: '淘宝' }
      return [
        '数据源（混合模式）：',
        ...table.map((row) => {
          const ready = row.source === 'api' ? (apiReady(config, row.platform) ? '密钥已配' : '密钥未配') :
            row.source === 'browser' ? (config.collect.browserEnabled ? '浏览器已开' : '浏览器未开') : '—'
          return `  ${zh[row.platform] ?? row.platform}：${row.source}　(${row.reason}；${ready})`
        }),
        '',
        '改法：价格 管理 数据源 京东 api',
        '　　　价格 管理 数据源 京东 browser',
        '　　　价格 管理 数据源 京东 manual',
        '　　　价格 管理 数据源 京东 auto',
      ].join('\n')
    }))

  // ── 采集 ────────────────────────────────────
  cmd(['price.admin.collect', 'price.管理.采集'], '立刻抓一轮', (c) => c
    .option('force', '-f, --force 忽略「今天已经抓过」的记录（手动采集默认已开启）')
    .option('noForce', '--no-force 只采今天还没采过的')
    .option('auto', '--no-auto 不自动搜索绑定，只采已绑定链接')
    .option('platform', '-p, --platform <platform:string> 只抓某个平台')
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      // 仿真发现：哪些平台还没有报价，就先「搜索 → 点商品卡 → 自动建立报价」。
      // 这样用户不需要手动贴链接，符合「仿真」的初衷。
      let simulate: Awaited<ReturnType<typeof discoverBySimulation>> | null = null
      if (argv.options?.auto !== false) {
        const offers0 = await repo.listOffers(ctx)
        const have = new Set(offers0.filter((o) => isValidItemId(o.platform, o.itemId)).map((o) => o.platform))
        // 淘宝走网页仿真；拼多多/京东只走 API，不在这里做网页发现
        const missing = ['taobao'].filter((p) => !have.has(p))
        if (missing.length) {
          simulate = await discoverBySimulation(ctx, config, {
            platforms: missing,
            modelLimit: Math.max(1, config.collect.discoverLimit ?? 50),
          }).catch(() => null)
        }
      }

      const result = await runCollect(ctx, config, {
        force: argv.options?.noForce !== true,
        platforms: argv.options?.platform
          ? [normalizePlatform(String(argv.options.platform)) ?? String(argv.options.platform)]
          : undefined,
      })
      const r = result
      const lines: string[] = []
      if (simulate) lines.push(describeSimulate(simulate), '')
      lines.push(`抓取完成：${r.ok} 成功 / ${r.failed} 失败 / ${r.skipped} 跳过，用时 ${Math.round(r.elapsedMs / 1000)} 秒`)
      for (const [platform, stat] of Object.entries(r.platforms)) {
        lines.push(`${platform}: ${stat.ok} 成功 ${stat.failed} 失败${stat.blocked ? `（${stat.blocked}）` : ''}`)
      }

      for (const note of r.notes ?? []) lines.push(`\n↳ ${note}`)

      // 跳过大户要说清原因，否则「62 跳过」看着像故障
      const reasons: string[] = []
      if (r.skipReasons.noItemId) reasons.push(`${r.skipReasons.noItemId} 条没有有效商品 ID（演示数据或未绑定真实链接）`)
      if (r.skipReasons.alreadyDone) reasons.push(`${r.skipReasons.alreadyDone} 条今天已经采过`)
      if (r.skipReasons.manual) reasons.push(`${r.skipReasons.manual} 条走人工模式`)
      if (reasons.length) {
        lines.push('')
        lines.push('跳过原因：')
        for (const reason of reasons) lines.push(`  · ${reason}`)
        if (r.skipReasons.noItemId) {
          lines.push('')
          lines.push('绑定真实商品链接后才会真正抓价：')
          lines.push('  价格 管理 绑定 5070ti 京东 「商品链接」')
          lines.push('  价格 管理 绑定 5070ti 京东（不给链接，自动搜一个）')
        }
      }

      return lines.join('\n')
    }))

  // ── 调试报告：给没法复现的环境收集证据 ───────
  cmd(['price.admin.debug', 'price.管理.调试'], '生成调试报告（环境/指纹/日志打包成文件）', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const report = await buildDebugReport(ctx, config)
      return debugSummary(report)
    }))
  // ── 自检 ────────────────────────────────────
  cmd(['price.admin.doctor', 'price.管理.自检'], '环境与数据检查', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      return runDoctor(ctx, config, isReady())
    }))

  // ── 清理 ────────────────────────────────────
  cmd(['price.admin.gc', 'price.管理.清理'], '清理过期数据', (c) => c
    .option('dryRun', '-n, --dryRun 只统计不删除')
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const result = await gc(ctx, config, { dryRun: !!argv.options?.dryRun })
      return result.dryRun
        ? `演练：将删除明细 ${result.snapshots} 行、聚合 ${result.daily} 行（截止 ${result.cutoff.snapshot}）`
        : `已删除明细 ${result.snapshots} 行、聚合 ${result.daily} 行、人工录入 ${result.manual} 条`
    }))

  // ── 演示数据 ────────────────────────────────
  cmd(['price.admin.demo', 'price.管理.演示'], '灌演示数据（需要 debug）', (c) => c
    .action(async (argv, days?: number) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!config.advanced.debug) return '演示数据需要先在「高级」里打开 debug'
      const span = Math.min(90, Math.max(7, days ?? 32))
      const seeded = await seedDemo(ctx, { days: span })
      const rebuilt = await rebuildAll(ctx)
      return `已生成 ${seeded.offers} 条报价 / ${seeded.snapshots} 条快照（${span} 天），重建聚合 ${rebuilt.daily} 行`
    }))

  // ── 重建 ────────────────────────────────────
  cmd(['price.admin.rebuild', 'price.管理.重建'], '从快照重算聚合与指标', (c) => c
    .action(async (argv, query?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      let modelIds: string[] | undefined
      if (query) {
        const matches = await repo.searchModels(ctx, query, 1)
        if (!matches.length) return `没有匹配「${query}」的型号`
        modelIds = [matches[0].model.id]
      }
      const result = await rebuildAll(ctx, modelIds)
      return `重建完成：日聚合 ${result.daily} 行、指标 ${result.stat} 行`
    }))

  // ── 状态 ────────────────────────────────────
  cmd(['price.admin.status', 'price.管理.状态'], '运行状态概览', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const models = await repo.listModels(ctx)
      const offers = await repo.listOffers(ctx)
      const stats = await repo.getAllStats(ctx)
      const targets = await repo.listTargets(ctx)
      const byCat = new Map<string, number>()
      for (const m of models) byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1)
      const byPlatform = new Map<string, number>()
      for (const o of offers) byPlatform.set(o.platform, (byPlatform.get(o.platform) ?? 0) + 1)
      return [
        `型号 ${models.length} 个（${[...byCat].map(([k, v]) => `${CATEGORY_LABEL[k as Category] ?? k} ${v}`).join(' / ')}）`,
        `报价 ${offers.length} 条（${[...byPlatform].map(([k, v]) => `${k} ${v}`).join(' / ') || '无'}）`,
        `有指标 ${stats.length} 个 · 推送目标 ${targets.length} 个`,
        `已接入平台：${listPlatforms().join(' / ')}`,
        `就绪 ${isReady() ? '是' : '否'}`,
      ].join('\n')
    }))

  // ── 型号库 ──────────────────────────────────
  cmd(['price.admin.models', 'price.管理.型号库'], '列出型号库', (c) => c
    .action(async (argv, category?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const models = await repo.listModels(ctx, category as Category)
      if (!models.length) return '型号库为空'
      return [
        `共 ${models.length} 个型号（★ 计入品类指数）`,
        ...models.slice(0, 40).map((m) => `${m.inIndex ? '★' : '·'} ${m.id}  ${m.name}`),
      ].join('\n')
    }))

  cmd(['price.admin.dump', 'price.管理.查看'], '查看某型号的原始指标', (c) => c
    .action(async (argv, query?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!query) return usage.dump
      const matches = await repo.searchModels(ctx, query, 1)
      if (!matches.length) return `没有匹配「${query}」的型号`
      const model = matches[0].model
      const stat = await repo.getStat(ctx, model.id)
      if (!stat) return `${model.name} 还没有指标`
      return [
        `${model.name}（${model.id}）`,
        `现价 ${money(stat.price)} · 数据日 ${stat.day}`,
        `STS：七日 ${(stat.r7 * 100).toFixed(2)}% 位置 ${stat.pos7.toFixed(2)} 波动 ${(stat.cv7 * 100).toFixed(2)}% ${stat.label7}`,
        `LPRS：样本 ${stat.n30} r30 ${(stat.r30 * 100).toFixed(2)}% 分位 ${(stat.q30 * 100).toFixed(0)}% 斜率 ${(stat.m30 * 100).toFixed(2)}%/月`,
        `评级 ${stat.grade} ${stat.modifier} 置信度${stat.confidence}`,
      ].join('\n')
    }))

  // ── 绑定商品链接 ────────────────────────────
  cmd(['price.admin.offer', 'price.管理.绑定'], '绑定型号：给链接，或直接用关键词搜', (c) => c
    .action(async (argv, query?: string, platform?: string, target?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!query || !platform) return usage.bind

      const key = platform.toLowerCase()
      const normalized = normalizePlatform(platform) ?? key

      const matches = await repo.searchModels(ctx, query, 1)
      if (!matches.length) return `没有匹配「${query}」的型号`
      const model = matches[0].model

      let itemId: string | null = null
      let url = ''
      let note = ''

      if (target) {
        // 给了链接/ID：先校验，别把型号名当 ID 拼进 URL
        if (!isValidItemId(normalized, extractItemId(normalized, target) ?? '')) {
          return [
            describeInvalidId(normalized, target),
            '',
            `这个 ID 拼出来的地址会是「${offerUrl(normalized, extractItemId(normalized, target) ?? target)}」，只会得到「商品不存在」。`,
            `建议去掉链接直接搜：价格 管理 绑定 ${query} ${platform}`,
          ].join('\n')
        }
        itemId = extractItemId(normalized, target)
        url = /^https?:/i.test(target) ? target : ''
      } else {
        // 没给链接：按型号名搜索，自动挑最像的
        const found = await searchPlatform(ctx, config, normalized, model.name, 3)
        if (found.needsLogin) {
          // 需要登录：给二维码，并记住这条搜索，登录成功后自动重试
          const ticket = await requestLogin(ctx, config, normalized)
          await queueSearch(ctx, normalized, model.name)
          const head = [
            `${platform}的搜索需要登录（${found.note ?? '被重定向到登录页'}）。`,
            '已给你登录二维码，扫完后我会自动重试这条搜索。',
            '',
            ticket.message,
          ].join('\n')
          return ticket.qr ? [head, h.image(ticket.qr, 'image/png')] : head
        }
        const hits = found.hits
        if (!hits.length) {
          return [
            `在${platform}没搜到「${model.name}」的商品${found.note ? '：' + found.note : ''}。`,
            `可以手动给链接：价格 管理 绑定 ${query} ${platform} 「商品链接」`,
          ].join('\n')
        }
        const best = hits[0]
        if (best.score < 0.5) {
          return [
            `搜到了 ${hits.length} 个，但没有足够像「${model.name}」的，先不自动绑：`,
            ...hits.map((hit, index) => `  ${index + 1}. [${(hit.score * 100).toFixed(0)}%] ${hit.title.slice(0, 40)}　${hit.itemId}`),
            '',
            `确定要绑哪个就把链接给我：价格 管理 绑定 ${query} ${platform} 「商品链接」`,
          ].join('\n')
        }
        itemId = best.itemId
        url = best.url.startsWith('http') ? best.url : ''
        note = `（搜索命中 ${(best.score * 100).toFixed(0)}%：${best.title.slice(0, 30)}）`
      }

      if (!itemId) return '解析商品 ID 失败'

      const bound = await bindOffer(ctx, {
        model, platform: normalized, itemId, url,
      })
      return `${bound.created ? '已绑定' : '已更新'}：${model.name} → ${platform}/${itemId}${note}`
    }))

  cmd(['price.admin.search', 'price.管理.搜索'], '按关键词搜平台商品（不绑定，只看看）', (c) => c
    .action(async (argv, keyword?: string, platform?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!keyword) return usage.search

      const key = (platform ?? 'jd').toLowerCase()
      const normalized = normalizePlatform(platform) ?? key

      const found = await searchPlatform(ctx, config, normalized, keyword, 5)
      if (found.needsLogin) {
        const ticket = await requestLogin(ctx, config, normalized)
        await queueSearch(ctx, normalized, keyword)
        const head = [
          `${platform ?? normalized} 的搜索需要登录（${found.note ?? '被重定向到登录页'}）。`,
          '已给你登录二维码，扫完后我会自动重试这条搜索，不用再发指令。',
          '',
          ticket.message,
        ].join('\n')
        return ticket.qr ? [head, h.image(ticket.qr, 'image/png')] : head
      }
      const hits = found.hits
      if (!hits.length) return `没搜到结果（${normalized}）${found.note ? '：' + found.note : ''}`
      return [
        `${normalized} 搜「${keyword}」：`,
        ...hits.map((hit, index) => `${index + 1}. [${(hit.score * 100).toFixed(0)}%] ${hit.title.slice(0, 36)}　${hit.itemId}`),
        '',
        `要绑就给 ID：价格 管理 绑定 「型号」 ${platform ?? '京东'} 「商品链接」`,
      ].join('\n')
    }))

  // ── 人工录入价格 ────────────────────────────
  cmd(['price.admin.set', 'price.管理.录入'], '人工录入今日价格（元）', (c) => c
    .action(async (argv, query?: string, yuan?: number, platform?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!query || !yuan) return usage.set
      const matches = await repo.searchModels(ctx, query, 1)
      if (!matches.length) return `没有匹配「${query}」的型号`
      const model = matches[0].model
      const target = normalizePlatform(platform) ?? (platform || 'manual')

      const result = await recordManualPrice(ctx, { model, platform: target, yuan: Number(yuan) })
      if (!result.ok) return '创建报价失败'
      return `已录入 ${model.name} ${money(toCents(yuan))}，重建 ${result.reconstructed} 行`
    }))

  // ── 预设 ────────────────────────────────────
  cmd(['price.admin.preset', 'price.管理.预设'], '内置型号：查看缺口 / 导入', (c) => c
    .option('import', '-i, --import 立即导入缺失的型号')
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (argv.options?.import) {
        const added = await importPreset(ctx)
        return added ? `已导入 ${added} 个型号` : '没有缺失的型号'
      }
      const missing = await diffPreset(ctx)
      if (!missing.length) return '型号库已包含全部内置型号'
      return [`内置型号里还有 ${missing.length} 个没导入：`, ...missing.map((m) => `· ${m.id} ${m.name}`)].join('\n')
    }))

  // ── 解封 ────────────────────────────────────
  cmd(['price.admin.unblock', 'price.管理.解封'], '解除平台熔断', (c) => c
    .action(async (argv, platform?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!platform) return usage.unblock
      await unblock(ctx, platform)
      return `${platform} 已解封`
    }))

  // ── 告警 ────────────────────────────────────
  cmd(['price.admin.alert', 'price.管理.告警'], '检查并发送告警（默认不下发）', (c) => c
    .option('dryRun', '-n, --dryRun 只打印不发送')
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const result = await pushAlerts(ctx, config, { dryRun: argv.options?.dryRun ?? true })
      return `告警检查完成：发送 ${result.sent} 条，跳过 ${result.skipped} 条`
    }))

  // ── 登录 ────────────────────────────────────
  /** 把「文本 + 可选二维码」拼成回复 */
  const withQr = (reply: { text: string; qr?: Buffer; fullPage?: Buffer }) => [
    reply.text,
    ...(reply.qr ? [h.image(reply.qr, 'image/png')] : []),
    ...(reply.fullPage ? [h.image(reply.fullPage, 'image/png')] : []),
  ]

  // 顺序登录向导：不带参数 = 走一轮（拼多多 → 京东 → 淘宝）；带平台 = 只登一个
  cmd(['price.admin.login', 'price.管理.登录'], '登录（不带参数=顺序走一轮，带平台=只登一个）', (c) => c
    .option('window', '-w, --window 强制开可见窗口（拼多多手机号登录用）')
    .action(async (argv, platform?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!platform) {
        const session = argv.session
        return withQr(await startWizard(ctx, config, session ? {
          platform: session.platform,
          channelId: session.channelId ?? '',
          selfId: session.selfId,
        } : undefined))
      }

      const target = normalizePlatform(platform)
      if (!target) {
        return [
          `不认识的平台「${platform}」。`,
          `可选：${platformChoices()}`,
          '不带平台参数就是三个平台依次登录：价格 管理 登录',
        ].join('\n')
      }

      const session = argv.session
      const reply = await startSingle(ctx, config, target, session ? {
        platform: session.platform,
        channelId: session.channelId ?? '',
        selfId: session.selfId,
      } : undefined)
      return reply.qr ? [reply.text, h.image(reply.qr, 'image/png')] : reply.text
    }))

  cmd(['price.admin.login.selfcheck', 'price.管理.登录.自检'], '自检三个平台的登录链路（真实打开登录页）', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      return runLoginSelfCheck(ctx, config)
    }))

  cmd(['price.admin.login.confirm', 'price.管理.登录.确认'], '这一步扫好了，进入下一个平台', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      return withQr(await advanceWizard(ctx, config, 'ok'))
    }))

  cmd(['price.admin.login.skip', 'price.管理.登录.跳过'], '跳过这一步（超时也会自动跳过）', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      return withQr(await advanceWizard(ctx, config, 'skip'))
    }))

  cmd(['price.admin.login.status', 'price.管理.登录.状态'], '看登录进度 / 各平台登录态', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const running = await getWizard(ctx)
      return running ? wizardStatus(ctx, config) : authReport(ctx, config)
    }))

  cmd(['price.admin.login.cancel', 'price.管理.登录.取消'], '取消整轮登录', (c) => c
    .action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      return cancelWizard(ctx)
    }))

  // 旧命令保留：price admin login.done <平台>（单平台确认）
  ctx.command('price.admin.login.done <platform:string>', '单平台登录确认（旧名）')
    .action(async (argv, platform?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!platform) return usage.loginConfirm
      const result = await confirmLogin(ctx, config, platform)
      return result.qr ? [result.message, h.image(result.qr, 'image/png')] : result.message
    })

  // ── 外部数据导入：给用户自己的爬虫用 ──────────
  cmd(['price.admin.ingest', 'price.管理.导入'], '导入外部抓的数据（JSON）', (c) => c
    .action(async (argv, json?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!json) return '用法：价格 管理 导入 {"quotes":[{"platform":"jd","model":"RTX 5070 Ti","price":6299}]}'
      let payload: unknown = null
      try { payload = JSON.parse(json) } catch { return 'JSON 解析失败，检查引号和花括号' }
      const result = await ingestQuotes(ctx, config, payload as never).catch((e) => null)
      if (!result) return '导入失败（看日志）'
      return describeIngest(result)
    }))
  // ── 页面探测：制定仿真方案用（只读） ──────────
  cmd(['price.admin.probe', 'price.管理.探测'], '探测某平台页面结构（只读，用于制定仿真方案）', (c) => c
    .action(async (argv, platform?: string, keyword?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const target = normalizePlatform(platform) ?? 'jd'
      const kw = keyword || 'RTX 5070'
      const result = await probePlatform(ctx, config, target, kw).catch(() => null)
      if (!result) return '探测失败：无法打开页面（看日志）'
      return result.text
    }))
  // ── 诊断：把浏览器看到的页面情况打出来 ──────
  cmd(['price.admin.diagnose', 'price.管理.诊断'], '诊断商品页（看是不是被登录墙挡了）', (c) => c
    .action(async (argv, platform?: string, itemId?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!platform) return usage.diagnose

      const key = platform.toLowerCase()
      const normalized = normalizePlatform(platform) ?? key

      let targetId = itemId
      if (!targetId) {
        // 只挑「像真 ID」的报价：库里的演示数据（pdd-gpu:...）拿去拼 URL 只会得到「商品不存在」
        const offers = (await repo.listOffers(ctx))
          .filter((o) => o.platform === normalized && o.active && isValidItemId(normalized, o.itemId))
        if (!offers.length) {
          return [
            `库里没有 ${platform} 的有效商品 ID。`,
            `用法：价格 管理 诊断 ${platform} 「商品ID」`,
            `　　或先搜一个：价格 管理 搜索 ${platform === '京东' ? '5070ti' : '5070ti'} ${platform}`,
          ].join('\n')
        }
        targetId = offers[0].itemId
      }

      // 先校验 ID 形态，别拼出一个必然 404 的地址
      if (!isValidItemId(normalized, targetId)) {
        return [
          describeInvalidId(normalized, targetId),
          '',
          `这个值拼出来的地址是「${offerUrl(normalized, targetId)}」，页面只会回「商品不存在」。`,
          '',
          '怎么办：',
          `  1. 按关键词搜一个真的：价格 管理 搜索 ${targetId} ${platform}`,
          `  2. 自动搜并绑定到型号：价格 管理 绑定 「型号」 ${platform}`,
          `  3. 直接把商品链接给我：价格 管理 绑定 「型号」 ${platform} https://...`,
        ].join('\n')
      }

      const probe = await probePage(ctx, config, offerUrl(normalized, targetId))
      if (!probe.ok) return `打不开页面：${probe.error}（${probe.elapsedMs}ms）`
      return [
        `平台 ${normalized} · 商品 ${targetId}`,
        `地址：${probe.href.slice(0, 100)}`,
        `标题：${probe.title.slice(0, 60) || '（空）'}`,
        `价格候选：${probe.priceTexts.length ? probe.priceTexts.join(' | ') : '（没找到价格类元素）'}`,
        `正文开头：${probe.bodyHead.slice(0, 160)}`,
        `耗时 ${probe.elapsedMs}ms`,
        '',
        '提示：如果价格候选里是 3??9 / 登录查看价格，说明没登录；先执行「价格 管理 登录 京东」扫码。',
      ].join('\n')
    }))

  // ── 推送目标（三级） ────────────────────────
  both(ctx, ['price.admin.target', 'price.管理.推送'], '推送目标管理',
    (c) => c.action(() => usage.targetAdd))

  both(ctx, ['price.admin.target.add', 'price.管理.推送.加'], '把当前会话设为目标',
    (c) => c.action(async (argv, kind?: string) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const session = argv.session
      if (!session?.channelId) return '当前会话不可用'
      const created = await addPushTarget(ctx, {
        platform: session.platform,
        channelId: session.channelId,
        selfId: session.selfId,
        guildId: session.guildId,
        kind: kind || 'digest',
      })
      return `${created ? '已登记' : '已更新'}：${session.platform}/${session.channelId}（收 ${kind || '报表'}）`
    }))

  both(ctx, ['price.admin.target.list', 'price.管理.推送.列表'], '列出推送目标',
    (c) => c.action(async (argv) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      const targets = await repo.listTargets(ctx)
      if (!targets.length) return '还没有推送目标'
      return targets.map((t) => `#${t.id} ${t.platform}/${t.channelId} 收${t.kind}${t.active ? '' : '（已停用）'}`).join('\n')
    }))

  both(ctx, ['price.admin.target.remove', 'price.管理.推送.删'], '删除推送目标',
    (c) => c.action(async (argv, id?: number) => {
      const denied = await guard(argv.session)
      if (denied) return denied
      if (!id) return usage.targetRemove
      const removed = await removePushTarget(ctx, id)
      return removed ? `已删除目标 #${id}` : `没有 #${id}`
    }))
}