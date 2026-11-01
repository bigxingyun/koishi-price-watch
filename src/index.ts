/**
 * 【依赖纪律】本插件的运行期依赖只有 koishi（peer）。
 *
 * 可选：playwright-core（peer, optional）—— 京东/淘宝/拼多多的价格必须靠真实浏览器
 * 执行页面 JS 才能拿到（价格被混淆成 `3??9`、需要登录态），Node 无替代方案。
 * 没装则插件照常启动，只关闭浏览器采集与图片渲染，并自动降级为纯文本。
 *
 * 明确不引入：dayjs / lodash / cheerio / chart.js / markdown-it / 模糊匹配库 / 定时库
 * （对应能力分别用原生 Date、原生数组方法、正则 + JSON.parse、内联 SVG、
 *   模板字符串、手写别名打分、ctx.setInterval 实现）
 */
import { Context, Schema } from 'koishi'
import { attachLogger } from './util/logring'

import { CATEGORIES, type Category } from './constants'
import * as store from './store/model'
import * as repo from './store/repo'
import { importPreset } from './store/preset'
import { rebuildAll } from './store/aggregate'
import { mountCommands } from './commands'
import { mountScheduler } from './crawler/scheduler'
import { hasCjkFont, fontHint } from './render/font'

export const name = 'price-watch'

export const inject = {
  required: ['database', 'http'],
  optional: ['puppeteer', 'server'],
}

export type RenderMode = 'auto' | 'text' | 'markdown' | 'image'

export interface TargetSeed {
  platform: string
  channelId: string
  selfId?: string
  guildId?: string
  kind?: 'digest' | 'alert' | 'auth'
  mode?: RenderMode
}

/**
 * 配置按「人会问的问题」分组，不按技术模块分组：
 *   常规  = 盯什么、看多少
 *   推送  = 什么时候发、发到哪
 *   采集  = 多久跑一次、怎么不被封
 *   数据  = 存多久、占多大
 *   告警  = 什么时候主动叫我
 *   高级  = 一般不用动
 */
export type DataSource = 'auto' | 'api' | 'browser' | 'manual'

export interface Config {
  basic: {
    categories: Category[]
    topMovers: number
    maxWatchItems: number
    compareThreshold: number
    mode: RenderMode
    markdownEnabled: boolean
    colorScheme: 'cn' | 'intl'
    theme: 'newspaper' | 'marble' | 'pixel'
    imageWidth: number
    imageScale: number
  }
  push: {
    dailyEnabled: boolean
    dailyTime: string
    weeklyEnabled: boolean
    weeklyWeekday: number
    weeklyTime: string
    monthlyEnabled: boolean
    monthlyTime: string
    targets: TargetSeed[]
  }
  /** 第三方开放平台密钥（联盟/推客） */
  api: {
    jd: { appKey: string; appSecret: string }
    pdd: { clientId: string; clientSecret: string }
    taobao: { appKey: string; appSecret: string }
  }
  /** 外部数据接入（给用户自己的爬虫用） */
  ingest?: {
    token?: string
    enabled?: boolean
  }
  /** 反爬协议开关（隔离模块，默认关闭；协议失效只熔断自己） */
  anti?: {
    enabled?: boolean
    jd?: { enabled?: boolean }
    pdd?: { enabled?: boolean }
    taobao?: { enabled?: boolean }
  }
  /** 每个平台的数据源：auto = 有密钥走 API，否则走浏览器 */
  source: { jd: DataSource; pdd: DataSource; taobao: DataSource }
  collect: {
    fullTime: string
    patchTime: string
    patchEnabled: boolean
    jitterSeconds: number
    intervalSeconds: number
    dailyCap: number
    timeoutMs: number
    samples: number
    maxOffers: number
    browserEnabled: boolean
    browserHeadless: boolean
    keepLoginWindow: boolean
    loginHeaded: boolean
    switchSku: boolean
    discoverLimit: number
    browserPath?: string
    profileDir: string
  }
  data: {
    snapshotDays: number
    dailyDays: number
    weekDays: number
    sizeWarnMB: number
  }
  alert: {
    enabled: boolean
    r7Threshold: number
    dailyDropThreshold: number
    newLowEnabled: boolean
    perChannelDaily: number
  }
  advanced: {
    debug: boolean
    dryRun: boolean
    preset: 'default' | 'none'
    owners: string[]
    loginMode: 'auto' | 'window' | 'qrcode'
    qrTimeout: number
    maxRetry: number
    loginStepTimeout: number
    textLimit: number
  }
}

const categoryUnion = Schema.union(CATEGORIES.map((c) => Schema.const(c)))
const modeUnion = Schema.union(['auto', 'text', 'markdown', 'image'] as const)

export const Config: Schema<Config> = Schema.intersect([
  // ── 常规 ─────────────────────────────────────
  Schema.object({
    basic: Schema.object({
      categories: Schema.array(categoryUnion)
        .default([...CATEGORIES])
        .description('盯哪几类：显卡 / 内存 / 固态硬盘。不确定就全选。'),
      topMovers: Schema.natural().min(1).max(10).default(5)
        .description('每期报表里列几个「涨跌最猛」的型号。设 5 就列前五名。'),
      maxWatchItems: Schema.natural().min(1).max(20).default(5)
        .description('每期报表里最多列几个「我的关注」。'),
      compareThreshold: Schema.percent().default(0.03)
        .description('同一型号在不同平台的价差超过多少，才写进「比价机会」。3% 是个合适起点。'),
      mode: modeUnion.default('auto')
        .description('报表默认长什么样。auto = 自动挑（能发图就发图，图不行发文本）。'),
      markdownEnabled: Schema.boolean().default(false)
        .description('是否允许发 Markdown。只在你的机器人确实支持 Markdown 时打开，否则会显示成一堆符号。'),
      colorScheme: Schema.union(['cn', 'intl'] as const).default('cn')
        .description('图片里涨跌的颜色：cn = 红涨绿跌（国内习惯），intl = 绿涨红跌。'),
      theme: Schema.union(['newspaper', 'marble', 'pixel'] as const).default('newspaper')
        .description('图片主题。dark 是米色纸的深色版，light 更接近白纸。'),
      imageWidth: Schema.natural().min(480).max(1600).default(960)
        .description('图片宽度（像素）。960 是手机上看最舒服的宽度。'),
      imageScale: Schema.natural().min(1).max(3).default(2)
        .description('图片清晰度倍数。2 = 二倍图，文字边缘更锐利，文件也大一倍。'),
    }).description('常规：盯什么、看多少'),
  }),

  // ── 推送 ─────────────────────────────────────
  Schema.object({
    push: Schema.object({
      dailyEnabled: Schema.boolean().default(true).description('每天发一份日报'),
      dailyTime: Schema.string().default('09:00').description('日报几点发（24 小时制，例如 09:00）'),
      weeklyEnabled: Schema.boolean().default(true).description('每周发一份周报'),
      weeklyWeekday: Schema.natural().min(1).max(7).default(1)
        .description('周报在周几发：1=周一，2=周二 …… 7=周日'),
      weeklyTime: Schema.string().default('09:30').description('周报几点发'),
      monthlyEnabled: Schema.boolean().default(true).description('每月发一份月报（1 号）'),
      monthlyTime: Schema.string().default('10:00').description('月报几点发'),
      targets: Schema.array(Schema.object({
        platform: Schema.string().required().description('平台名，如 qq / onebot / telegram'),
        channelId: Schema.string().required().description('会话 ID'),
        selfId: Schema.string().description('机器人自己的 ID（同名平台有多个机器人时才要填）'),
        guildId: Schema.string().description('服务器 ID（Discord / KOOK 需要）'),
        kind: Schema.union(['digest', 'alert', 'auth'] as const).default('digest')
          .description('这个目标收什么：digest 报表 / alert 告警 / auth 登录请求'),
        mode: modeUnion.default('auto').description('发给这个目标时用什么形态'),
      })).default([])
        .description('推送目标。平常不用改这里：在目标群里发「价格 管理 推送 加」会自动登记，改这里只在首次启动生效。'),
    }).description('推送：什么时候发、发到哪'),
  }),

  // ── 采集 ─────────────────────────────────────
  Schema.object({
    source: Schema.object({
      jd: Schema.union(['auto', 'api', 'browser', 'manual'] as const).default('auto')
        .description('京东：auto=有联盟密钥走 API，否则浏览器；api 只用联盟；browser 只用浏览器；manual 不采集'),
      pdd: Schema.union(['auto', 'api', 'browser', 'manual'] as const).default('auto').description('拼多多：同上'),
      taobao: Schema.union(['auto', 'api', 'browser', 'manual'] as const).default('auto').description('淘宝：同上'),
    }).description('每个平台用哪种数据源 —— 混合模式就在这里配：有密钥的平台填 auto/api，没有的填 browser。'),

    api: Schema.object({
      jd: Schema.object({
        appKey: Schema.string().description('京东联盟 appKey'),
        appSecret: Schema.string().role('secret').description('京东联盟 appSecret'),
      }).description('京东联盟'),
      pdd: Schema.object({
        clientId: Schema.string().description('多多进宝 client_id'),
        clientSecret: Schema.string().role('secret').description('多多进宝 client_secret'),
      }).description('多多进宝'),
      taobao: Schema.object({
        appKey: Schema.string().description('淘宝客 appKey'),
        appSecret: Schema.string().role('secret').description('淘宝客 appSecret'),
      }).description('淘宝客'),
    }).description('联盟/推客密钥。填了哪家，那家就能走 API；没填的自动回退浏览器。'),

    collect: Schema.object({
      fullTime: Schema.string().default('03:00')
        .description('每天几点抓价格（建议凌晨：平台压力小、被拦概率低）'),
      patchTime: Schema.string().default('14:00').description('补抓时间：只补当天失败的，不重抓已成功的'),
      patchEnabled: Schema.boolean().default(true).description('是否启用下午补抓'),
      jitterSeconds: Schema.natural().max(3600).default(600)
        .description('计划时间随机偏移的最大秒数。让每天的抓取时刻不完全一样，看起来更像人。'),
      intervalSeconds: Schema.natural().min(1).max(120).default(5)
        .description('同一个平台两次请求之间等几秒。这个值越小越容易被封，5 秒是安全起点。'),
      dailyCap: Schema.natural().min(10).max(2000).default(200)
        .description('每个平台每天最多请求几次。到上限立刻停手，第二天再来。'),
      timeoutMs: Schema.natural().min(5000).max(120000).default(30000)
        .description('单个请求最多等几毫秒。30000 = 30 秒。'),
      samples: Schema.natural().min(1).max(5).default(1)
        .description('每个商品每天抓几次取中位数。设 1 就够；波动大的商品可以设 2~3。'),
      maxOffers: Schema.natural().min(1).max(600).default(80)
        .description('一轮最多抓多少个商品链接，防止型号库变大后请求量失控。'),
      browserEnabled: Schema.boolean().default(false)
        .description('用真实浏览器抓。京东 / 淘宝 / 拼多多都必须开，纯 HTTP 拿不到价格。'),
      browserHeadless: Schema.boolean().default(true)
        .description('浏览器在后台无界面运行。首次手动登录时可以关掉，看看窗口。'),
      browserPath: Schema.string()
        .description('浏览器程序路径。留空则自动找系统里的 Chrome / Edge。'),
      discoverLimit: Schema.number().default(50).min(1).max(200)
        .description('每轮「采集」最多自动发现多少个型号（默认 50，基本覆盖整个型号库）。'),
      switchSku: Schema.boolean().default(false)
        .description('取价前是否先切到目标型号 SKU。商品只有一个型号时无影响；多型号商品开启后才能盯准目标型号。'),
      loginHeaded: Schema.boolean().default(false)
        .description('登录时是否打开可见窗口。默认 false：直接把二维码截图发到聊天里，扫完即登录，不需要桌面。'),
      keepLoginWindow: Schema.boolean().default(true)
        .description('登录成功后**保留浏览器窗口**，采集直接复用同一个浏览器实例。\n保留更接近真人行为（指纹/页面内会话都不变），代价是后台常驻一个窗口。'),
      profileDir: Schema.string().default('data/price-watch/profiles')
        .description('登录态存放目录。每个平台一个子目录；**删掉这里就等于退出登录**。'),
    }).description('采集：多久跑一次、怎么不被封'),
  }),

  // ── 数据 ─────────────────────────────────────
  Schema.object({
    data: Schema.object({
      snapshotDays: Schema.natural().min(30).max(730).default(120)
        .description('每天的原始价格明细保留多少天。超过就删掉（聚合与指标不受影响）。'),
      dailyDays: Schema.natural().min(90).max(3650).default(730)
        .description('型号的日聚合数据保留多少天。查询趋势用这份，建议比明细长得多。'),
      weekDays: Schema.natural().min(365).max(3650).default(1095)
        .description('周聚合数据保留多少天（当前实现未启用周聚合表，此项预留给后续）。'),
      sizeWarnMB: Schema.natural().default(200)
        .description('数据库超过多少 MB 时提醒你。只提醒，不自动删。'),
    }).description('数据：存多久、占多大'),
  }),

  // ── 告警 ─────────────────────────────────────
  Schema.object({
    alert: Schema.object({
      enabled: Schema.boolean().default(true).description('价格异动时是否主动提醒'),
      r7Threshold: Schema.percent().default(0.05)
        .description('七天内涨跌超过多少就提醒。5% 适合大多数硬件。'),
      dailyDropThreshold: Schema.percent().default(0.03)
        .description('单日跌超过多少就提醒'),
      newLowEnabled: Schema.boolean().default(true)
        .description('创三十日新低时也提醒'),
      perChannelDaily: Schema.natural().min(1).max(20).default(5)
        .description('同一个会话每天最多收到几条告警，防止刷屏'),
    }).description('告警：什么时候主动叫你'),
  }),

  // ── 高级 ─────────────────────────────────────
  Schema.object({
    ingest: Schema.object({
      enabled: Schema.boolean().default(true).description('是否允许外部爬虫把数据推进来（HTTP + 指令两种方式）'),
      token: Schema.string().description('接入密钥。外部请求必须带上它，留空则只允许主人用「导入」指令'),
    }).description('外部数据接入：接受你自己爬的数据'),
    advanced: Schema.object({
      debug: Schema.boolean().default(false)
        .description('输出调试日志。「演示数据」功能需要打开它。'),
      dryRun: Schema.boolean().default(false)
        .description('演练模式：照常采集和计算，但不真的发消息。'),
      preset: Schema.union(['default', 'none'] as const).default('default')
        .description('首次启动是否导入内置的 28 个型号（只补不覆盖，你改过的不会被冲掉）。'),
      owners: Schema.array(Schema.string()).default([])
        .description('主人身份，格式 平台:用户ID，例如 onebot:123456789，多个用逗号分隔。登录二维码只会发到这里。'),
      loginMode: Schema.union(['auto', 'window', 'qrcode'] as const).default('auto')
        .description('怎么登录：auto 自动判断有没有屏幕；window 本机开窗口手动登；qrcode 截图二维码发给你扫。'),
      qrTimeout: Schema.natural().min(30).max(600).default(120)
        .description('二维码多少秒后失效'),
      maxRetry: Schema.natural().min(1).max(10).default(3)
        .description('二维码过期后自动重截几次'),
      loginStepTimeout: Schema.natural().min(30).max(1800).default(120)
        .description('顺序登录时每一步等多久（秒）。默认 120 秒，二维码本身约 60 秒过期，插件会自动换新码。'),
      textLimit: Schema.natural().min(200).max(8000).default(1800)
        .description('文本形态下一条消息最长多少字。超出会按「比价 → 关注 → 异动」顺序裁剪。'),
    }).description('高级：一般不用动'),
  }),
])

export function apply(ctx: Context, config: Config) {
  const logger = attachLogger(ctx.logger('price-watch'))
  const state = { ready: false }

  // 建表必须在同步段完成，且早于任何读写
  store.extend(ctx)

  ctx.on('ready', async () => {
    try {
      if (config.advanced.preset === 'default') {
        const added = await importPreset(ctx)
        if (added) logger.info('已导入内置型号：新增 %d 个', added)
      }
      await repo.seedTargets(ctx, config.push.targets.map((t) => ({
        platform: t.platform,
        channelId: t.channelId,
        selfId: t.selfId,
        guildId: t.guildId,
        kind: t.kind ?? 'digest',
        mode: t.mode ?? 'auto',
      })))
      state.ready = true

      // 恢复上次遗留的登录流程：状态在数据库里，定时器在内存里，
      // 进程一重启就会卡在「剩余 0 秒」不动（实测踩过），所以启动时必须重新接上。
      try {
        const { resumeWizard } = await import('./auth/wizard')
        const { resumeLoginWatch } = await import('./auth/login')
        await resumeWizard(ctx, config)
        await resumeLoginWatch(ctx, config)
      } catch (error) {
        logger.warn('恢复登录流程失败：%s', (error as Error).message)
      }

      if (!hasCjkFont()) logger.warn('%s（图片模式将自动降级为文本）', fontHint())

      mountScheduler(ctx, config)
      logger.info('就绪：型号 %d 个、报价 %d 条',
        await repo.countModels(ctx), await repo.countOffers(ctx))
    } catch (e) {
      logger.error('初始化失败：%s', (e as Error).message)
    }
  })

  ctx.on('dispose', () => {
    state.ready = false
  })

  mountCommands(ctx, config, () => state.ready)

  // ── 外部数据接入：POST /price-watch/ingest ──────
  // 给用户自己的爬虫用：按约定格式推 JSON，插件只负责清洗 + 入库
  const server = (ctx as unknown as { server?: { post?: (path: string, handler: (koa: unknown) => unknown) => void } }).server
  if (server?.post && config.ingest?.enabled !== false) {
    server.post('/price-watch/ingest', async (koa) => {
      const k = koa as { request: { body?: unknown }; status: number; body: unknown }
      try {
        const payload = (k.request.body ?? {}) as { token?: string; quotes?: unknown[] }
        const expected = config.ingest?.token
        if (expected && payload.token !== expected) {
          k.status = 401
          k.body = { ok: false, error: 'token 不正确' }
          return
        }
        const { ingestQuotes } = await import('./service/ingest')
        const result = await ingestQuotes(ctx, config, payload as never)
        k.status = 200
        k.body = { ok: true, ...result }
      } catch (error) {
        k.status = 500
        k.body = { ok: false, error: (error as Error).message.slice(0, 120) }
      }
    })
  }


  ctx.set('priceWatch', {
    config,
    rebuild: (modelIds?: string[]) => rebuildAll(ctx, modelIds),
  })
}

declare module 'koishi' {
  interface Context {
    priceWatch?: {
      config: Config
      rebuild: (modelIds?: string[]) => Promise<{ daily: number; stat: number }>
    }
  }
}