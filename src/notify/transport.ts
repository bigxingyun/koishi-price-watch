import { Context, h, type Fragment } from 'koishi'

import type { Config, RenderMode } from '../index'
import type { PwTarget } from '../store/model'
import * as repo from '../store/repo'
import { capabilityOf, resolveMode } from '../render/capability'
import { renderSheets } from '../render/image'
import { renderMarkdown } from '../render/markdown'
import type { DigestModel } from '../render/model'
import { renderText } from '../render/text'
import { hasCjkFont, fontHint } from '../render/font'
import { textLimitOf } from '../render/capability'

export type RenderKind = Exclude<RenderMode, 'auto'>

export interface TargetOutcome {
  targetId: number
  platform: string
  channelId: string
  ok: boolean
  mode: RenderKind
  degradedFrom?: RenderKind
  error?: string
}

/** 渲染成可发送的消息内容 */
export async function renderFor(
  ctx: Context,
  config: Config,
  model: DigestModel,
  mode: RenderKind,
): Promise<{ content: Fragment; mode: RenderKind }> {
  if (mode === 'image') {
    const sheets = await renderSheets(ctx, config, model)
    if (!sheets.length) return { content: renderText(model, config.advanced.textLimit), mode: 'text' }
    return { content: sheets.map((sheet) => h.image(sheet.buffer, sheet.mime)), mode }
  }
  if (mode === 'markdown') {
    return { content: renderMarkdown(model), mode }
  }
  return { content: renderText(model, textLimitOf(config)), mode }
}

/** 降级链：markdown → image → text；image → text；text 无处可降 */
function fallbackChain(mode: RenderKind): RenderKind[] {
  if (mode === 'markdown') return ['markdown', 'image', 'text']
  if (mode === 'image') return ['image', 'text']
  return ['text']
}

export interface DispatchOptions {
  kind: string
  /** 为单个目标构建内容；返回 null 表示跳过该目标 */
  build: (target: PwTarget) => Promise<DigestModel | null>
  dryRun?: boolean
}

/**
 * 按 pw_target 逐个投递。
 *
 * 三条纪律：
 * 1. 形态按「目标配置 → 能力表」解析，不猜平台能力
 * 2. 发送失败逐级降级，用户看不到异常
 * 3. 连续 3 次失败的目标自动置 inactive，避免每天无效重试
 */
export async function dispatch(
  ctx: Context,
  config: Config,
  options: DispatchOptions,
): Promise<TargetOutcome[]> {
  const logger = ctx.logger('price-watch')
  const targets = await repo.listTargets(ctx, options.kind)
  const outcomes: TargetOutcome[] = []

  if (!targets.length) {
    logger.info('没有 %s 类型的推送目标（用 price admin target add 绑定）', options.kind)
    return outcomes
  }

  // 中文字体缺失时，图片模式直接跳过，别发豆腐块
  const imageUsable = hasCjkFont()
  if (!imageUsable) logger.warn('%s', fontHint())

  for (const target of targets) {
    const baseMode = resolveMode(target.platform, (target.mode as RenderMode) || 'auto', config)
    const cap = capabilityOf(target.platform)

    const digest = await options.build(target)
    if (!digest) {
      outcomes.push({ targetId: target.id, platform: target.platform, channelId: target.channelId, ok: true, mode: baseMode })
      continue
    }

    // 演练模式不需要真实 bot：先把渲染跑通，日志里记一笔
    const bot = options.dryRun
      ? undefined
      : ctx.bots.find((b) => b.platform === target.platform
        && (!target.selfId || b.selfId === target.selfId))
    if (!bot && !options.dryRun) {
      const error = `找不到 ${target.platform} 的机器人实例`
      await repo.markTargetFailed(ctx, target.id, target.failCount + 1)
      outcomes.push({ targetId: target.id, platform: target.platform, channelId: target.channelId, ok: false, mode: baseMode, error })
      continue
    }

    let sent = false
    let lastError: string | undefined
    let usedMode = baseMode

    for (const attempt of fallbackChain(baseMode)) {
      if (attempt === 'image' && (!cap.image || !imageUsable)) continue
      if (attempt === 'markdown' && !config.basic.markdownEnabled) continue
      try {
        const { content } = await renderFor(ctx, config, digest, attempt)
        if (options.dryRun) {
          const size = typeof content === 'string' ? `${content.length} 字符` : '图片'
          logger.info('[dryRun] → %s/%s 以 %s 形态发送 %s',
            target.platform, target.channelId, attempt, size)
          usedMode = attempt
          sent = true
          break
        }
        if (!bot) throw new Error('找不到机器人实例')
        await bot.sendMessage(target.channelId, content, target.guildId || undefined)
        usedMode = attempt
        sent = true
        break
      } catch (error) {
        lastError = (error as Error).message
        logger.warn('%s 以 %s 形态发送失败：%s', target.platform, attempt, lastError)
      }
    }

    if (sent) {
      await repo.markTargetFailed(ctx, target.id, 0)
      outcomes.push({
        targetId: target.id, platform: target.platform, channelId: target.channelId,
        ok: true, mode: usedMode,
        degradedFrom: usedMode === baseMode ? undefined : baseMode,
      })
    } else {
      await repo.markTargetFailed(ctx, target.id, target.failCount + 1)
      outcomes.push({
        targetId: target.id, platform: target.platform, channelId: target.channelId,
        ok: false, mode: baseMode, error: lastError,
      })
    }
  }

  return outcomes
}
