import { Context } from 'koishi'

import { STATUS, toDay, type Category } from '../constants'
import type { Config } from '../index'
import { getAdapter } from '../adapters'
import * as repo from '../store/repo'
import { collectOne } from '../collect/one'
import { describeResult, priceOutlier, statusCodeOf } from '../domain/quote'
import { toCents } from '../constants'
import { rebuildDaily, rebuildStat } from '../store/aggregate'
import type { PwOffer } from '../store/model'
import { jitter, sleep } from './fetcher'
import { blockPlatform, checkGuard, incrCount } from './guard'
import { isSanePrice, isSuspicious } from './normalize'
import { AuthError, ParseError, type Quote } from './types'

export interface CollectOptions {
  day?: number
  /** 只跑这些平台 */
  platforms?: string[]
  /** 只补当日失败/缺失的报价 */
  onlyMissing?: boolean
  /** 忽略「今日已成功」的去重（强制重采） */
  force?: boolean
  limit?: number
}

export interface PlatformStat {
  ok: number
  failed: number
  skipped: number
  blocked?: string
}

export interface CollectResult {
  day: number
  total: number
  ok: number
  failed: number
  skipped: number
  /** 跳过原因分类：看得懂才知道下一步做什么 */
  skipReasons: { noItemId: number; alreadyDone: number; manual: number }
  /** 需要用户知道的事（例如「某平台需要登录，已发出二维码」） */
  notes: string[]
  platforms: Record<string, PlatformStat>
  /** daily / stat 重建行数 */
  rebuilt: { daily: number; stat: number }
  elapsedMs: number
}

/**
 * 单轮采集。
 *
 * 关键约束（设计文档 §1.3）：
 * - 平台之间并行、平台内部串行（并发是风控第一触发因素）
 * - 每个请求前过守卫（日硬闸 + 熔断），请求后计数
 * - 命中登录/验证 → 立即熔断该平台 24h，不再继续撞
 * - 同一 (offerId, day) 已有成功记录 → 跳过（幂等）
 */
export async function runCollect(
  ctx: Context,
  config: Config,
  options: CollectOptions = {},
): Promise<CollectResult> {
  const started = Date.now()
  const day = options.day ?? toDay()
  const logger = ctx.logger('price-watch')

  const models = await repo.listModels(ctx)
  const modelMap = new Map(models.map((m) => [m.id, m]))
  const enabledCategories = new Set<Category>(config.basic.categories)

  const offers = (await repo.listOffers(ctx))
    .filter((offer) => offer.active)
    .filter((offer) => {
      const model = modelMap.get(offer.modelId)
      return model ? enabledCategories.has(model.category as Category) : false
    })
    .filter((offer) => !options.platforms?.length || options.platforms.includes(offer.platform))
    .slice(0, config.collect.maxOffers)

  const todaySnapshots = await repo.getSnapshots(ctx, [...new Set(offers.map((o) => o.modelId))], day)
  const doneKey = new Set(
    todaySnapshots.filter((s) => s.status === STATUS.OK).map((s) => `${s.offerId}:${s.day}`),
  )

  // 采集撞到登录墙时自动发起登录，省得用户再手动发一次指令
  const promptedAuth = new Set<string>()
  // 本轮内已确认需要登录的平台：同轮不再尝试
  const authBlocked = new Set<string>()

  const byPlatform = new Map<string, PwOffer[]>()
  for (const offer of offers) {
    const list = byPlatform.get(offer.platform) ?? []
    list.push(offer)
    byPlatform.set(offer.platform, list)
  }

  const result: CollectResult = {
    day, total: offers.length, ok: 0, failed: 0, skipped: 0,
    skipReasons: { noItemId: 0, alreadyDone: 0, manual: 0 },
    notes: [],
    platforms: {}, rebuilt: { daily: 0, stat: 0 }, elapsedMs: 0,
  }

  await Promise.all([...byPlatform.entries()].map(async ([platform, list]) => {
    const stat: PlatformStat = { ok: 0, failed: 0, skipped: 0 }
    result.platforms[platform] = stat

    const adapter = getAdapter(platform)
    if (!adapter) {
      stat.blocked = '未接入该平台的适配器'
      stat.skipped += list.length
      result.skipped += list.length
      return
    }

    const decision = await checkGuard(ctx, platform, config.collect.dailyCap, day)
    if (!decision.ok) {
      stat.blocked = decision.reason
      stat.skipped += list.length
      result.skipped += list.length
      logger.warn('%s', decision.reason)
      return
    }

    for (const offer of list) {
      if (authBlocked.has(platform)) break
      // 没有可用的商品 ID（演示数据 / 只做过人工录入）→ 不计失败，直接跳过
      const crawlable = offer.platform === 'manual' || /\d{6,}/.test(offer.itemId)
      if (!crawlable) {
        logger.debug('跳过 %s/%s：itemId 无 6 位数字', offer.platform, offer.itemId)
        result.skipReasons.noItemId++
        stat.skipped++
        result.skipped++
        continue
      }
      if (!options.force && doneKey.has(`${offer.id}:${day}`)) {
        logger.debug('跳过 %s/%s：今日已完成', offer.platform, offer.itemId)
        result.skipReasons.alreadyDone++
        stat.skipped++
        result.skipped++
        continue
      }
      if (options.onlyMissing && doneKey.has(`${offer.id}:${day}`)) {
        result.skipReasons.alreadyDone++
        stat.skipped++
        result.skipped++
        continue
      }

      const model = modelMap.get(offer.modelId)
      if (!model) continue

      const gate = await checkGuard(ctx, platform, config.collect.dailyCap, day)
      if (!gate.ok) {
        stat.blocked = gate.reason
        break
      }

      await incrCount(ctx, platform, day)
      // 采集一个报价：数据源决策 + 提供者调用 + 结果归一，全部在 collectOne 里
      const outcome = await collectOne({ ctx, config, offer, model, day })
      logger.info(
        '%s %s → %s（%sms）',
        platform, offer.itemId, describeResult(outcome), outcome.costMs ?? 0,
      )

if (outcome.status === 'auth_required') {
        // 「需要登录」不是故障：不能拿它触发 24 小时熔断，
        // 否则会变成「要登录 → 熔断 → 采集被挡 → 又要登录」的死锁。
        // 连续撞登录墙 = 风控在升级，停下来冷却，别把账号刷成黑名单
        const key = `authStreak:${platform}`
        const streak = (Number(await repo.metaGet(ctx, key)) || 0) + 1
        await repo.metaSet(ctx, key, String(streak))
        if (streak >= 3) {
          await blockPlatform(ctx, platform, 1, '连续 3 次要求登录，暂停 1 小时冷却（避免被风控踢号）')
          result.notes.push(`${platform} 连续 ${streak} 次要求登录，已暂停 1 小时；冷却后重新登录再采`)
        }

        if (!promptedAuth.has(platform) && config.collect.browserEnabled) {
          promptedAuth.add(platform)
          const ticket = await import('../auth/wizard')
            .then((mod) => mod.startSingle(ctx, config, platform))
            .catch(() => null)
          if (ticket) result.notes.push(`${platform} 需要登录，二维码已经发出来了，扫完再采一次即可`)
        }
        // 本轮内该平台不再继续尝试，避免连撞同一堵墙
        authBlocked.add(platform)
        stat.failed++
        result.failed++
        continue
      }

      if (outcome.ok) {
        // 偏离历史中位数太多 → 标可疑，不污染报表
        const history = await repo.getRecentSnapshots(ctx, day - 30).catch(() => [])
        const past = history
          .filter((s) => s.modelId === model.id && s.status === STATUS.OK)
          .map((s) => s.price / 100)
        const outlier = priceOutlier(past, outcome.price ?? 0)
        if (outlier.outlier) {
          await persist(ctx, offer, day, { price: 0, status: STATUS.SUSPICIOUS, note: outlier.reason })
          stat.failed++; result.failed++
          logger.warn('%s %s 价格可疑：%s', platform, offer.itemId, outlier.reason)
          continue
        }

        await persist(ctx, offer, day, {
          price: toCents(outcome.price ?? 0),
          status: STATUS.OK,
          note: outcome.evidence,
        })
        await repo.metaDel(ctx, `authFail:${platform}`)
        await repo.metaDel(ctx, `authStreak:${platform}`).catch(() => undefined)
        stat.ok++
        result.ok++
      } else {
        await persist(ctx, offer, day, {
          price: 0,
          status: statusCodeOf(outcome.status),
          note: outcome.reason,
        })
        stat.failed++
        result.failed++
        logger.warn('%s %s 采集失败[%s]：%s', platform, offer.itemId, outcome.status, outcome.reason)
      }

      const gap = config.collect.intervalSeconds * 1000
      await sleep(jitter(gap * 0.7, gap * 1.3))
    }
  }))

  if (result.ok > 0 || result.failed > 0) {
    result.rebuilt.daily = await rebuildDaily(ctx, { sinceDay: day, today: day })
    result.rebuilt.stat = await rebuildStat(ctx, { today: day })
  }

  result.elapsedMs = Date.now() - started
  logger.info(
    '采集完成：%d 成功 / %d 失败 / %d 跳过，用时 %d s（%s）',
    result.ok, result.failed, result.skipped, Math.round(result.elapsedMs / 1000),
    Object.entries(result.platforms).map(([p, s]) => `${p}:${s.ok}✓${s.failed}✗`).join(' '),
  )
  return result
}

async function persist(ctx: Context, offer: PwOffer, day: number, quote: Quote): Promise<void> {
  // 质量防线：价格相对上一次成功价偏离 >50% 时标可疑，仍保留记录但不参与代表价
  let status = quote.status
  if (status === STATUS.OK) {
    const last = await repo.getLastOkPrice(ctx, offer.id, day)
    if (last && isSuspicious(quote.price, last)) status = STATUS.SUSPICIOUS
  }
  await repo.upsertSnapshot(ctx, {
    offerId: offer.id,
    modelId: offer.modelId,
    day,
    price: quote.price,
    listPrice: quote.listPrice ?? quote.price,
    status,
    samples: 1,
  })
}