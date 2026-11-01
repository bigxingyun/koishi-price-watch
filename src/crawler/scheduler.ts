import { Context } from 'koishi'

import { fromDay, toDay } from '../constants'
import type { Config } from '../index'
import { runCollect } from './collect'
import { metaGet, metaSet } from '../store/repo'
import { pushDigest } from '../notify/digest'
import { pushAlerts } from '../notify/alert'

/**
 * 调度器：60 秒一次 tick，到点才真正干活。
 *
 * 为什么不用 cron 库：日级任务不需要秒级精度；ctx.setInterval 天然随插件卸载回收，
 * 不引入依赖，也不会在热重启后累积定时器。
 *
 * 跨重启幂等：每个任务跑完把 lastRun:{name} 写成当天的 YYYYMMDD，
 * 重启后同一任务不会再跑第二遍。
 */

interface Plan {
  name: string
  time: string
  /** 额外的日期条件（周报只在周一、月报只在 1 号） */
  when?: (now: Date) => boolean
  run: (ctx: Context, config: Config) => Promise<void>
}

/** 当天的计划触发时刻（含按天稳定的抖动，避免每天同一秒打请求） */
export function plannedAt(day: number, hhmm: string, jitterSeconds: number): Date {
  const [hour, minute] = hhmm.split(':').map((v) => Number.parseInt(v, 10))
  const base = fromDay(day)
  base.setHours(Number.isFinite(hour) ? hour : 3, Number.isFinite(minute) ? minute : 0, 0, 0)
  const offset = jitterSeconds > 0 ? hash(`${day}:${hhmm}`) % jitterSeconds : 0
  return new Date(base.getTime() + offset * 1000)
}

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 计划时间过了多久还算「来得及跑」（超过这个窗口说明进程当时不在，就别补了） */
const WINDOW_MS = 45 * 60 * 1000

export function mountScheduler(ctx: Context, config: Config) {
  const logger = ctx.logger('price-watch')
  let running = false

  const plans: Plan[] = [
    {
      name: 'full',
      time: config.collect.fullTime,
      run: async (c, cfg) => {
        const result = await runCollect(c, cfg, {})
        logger.info('全量采集：%d 成功 / %d 失败', result.ok, result.failed)
      },
    },
    {
      name: 'patch',
      time: config.collect.patchTime,
      run: async (c, cfg) => {
        if (!cfg.collect.patchEnabled) return
        const result = await runCollect(c, cfg, { onlyMissing: true })
        logger.info('补采：%d 成功 / %d 失败', result.ok, result.failed)
      },
    },
  ]

  const push = (label: string, report: 'daily' | 'weekly' | 'monthly') => async (c: Context, cfg: Config) => {
    const outcomes = await pushDigest(c, cfg, { report })
    const ok = outcomes.filter((o) => o.ok).length
    logger.info('%s已推送：%d / %d 个目标成功', label, ok, outcomes.length)
  }

  if (config.push.dailyEnabled) {
    plans.push({ name: 'digest', time: config.push.dailyTime, run: push('日报', 'daily') })
  }
  if (config.push.weeklyEnabled) {
    plans.push({
      name: 'weekly',
      time: config.push.weeklyTime,
      // JS 的 getDay()：0=周日 … 6=周六；配置里 1=周一 … 7=周日
      when: (now) => now.getDay() === config.push.weeklyWeekday % 7,
      run: push('周报', 'weekly'),
    })
  }
  if (config.push.monthlyEnabled) {
    plans.push({
      name: 'monthly',
      time: config.push.monthlyTime,
      when: (now) => now.getDate() === 1,
      run: push('月报', 'monthly'),
    })
  }

  let lastAlertCheck = 0

  async function tick(): Promise<void> {
    if (running) return
    const now = new Date()
    const day = toDay(now)

    // 告警是事件驱动的：每小时看一次，8:00~23:00 之外不打扰
    if (config.alert.enabled
      && now.getHours() >= 8 && now.getHours() <= 23
      && now.getTime() - lastAlertCheck > 3600_000) {
      lastAlertCheck = now.getTime()
      void pushAlerts(ctx, config).then((r) => {
        if (r.sent) logger.info('告警已发送 %d 条', r.sent)
      }).catch((error) => logger.warn('告警检查失败：%s', (error as Error).message))
    }

    for (const plan of plans) {
      if (plan.when && !plan.when(now)) continue
      const planned = plannedAt(day, plan.time, config.collect.jitterSeconds)
      if (now < planned) continue
      if (now.getTime() - planned.getTime() > WINDOW_MS) continue

      const key = `lastRun:${plan.name}`
      const last = await metaGet(ctx, key)
      if (last === String(day)) continue

      running = true
      try {
        await plan.run(ctx, config)
        await metaSet(ctx, key, String(day))
      } catch (error) {
        logger.error('%s 任务失败：%s', plan.name, (error as Error).message)
      } finally {
        running = false
      }
      return
    }
  }

  ctx.setInterval(() => { void tick() }, 60_000)
  logger.info(
    '调度器已启动：全量 %s / 补采 %s / 日报 %s / 周报 %s(周%s) / 月报 %s(1号)（抖动 ≤%d 秒）',
    config.collect.fullTime, config.collect.patchTime, config.push.dailyTime,
    config.push.weeklyTime, config.push.weeklyWeekday, config.push.monthlyTime, config.collect.jitterSeconds,
  )

  // 页面关闭前不做持久化（见设计文档：dispose 不保证执行），状态都实时落库
}
