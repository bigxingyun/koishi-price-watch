import { Context } from 'koishi'

import type { Config } from '../index'
import type { PwTarget } from '../store/model'
import * as repo from '../store/repo'
import { buildDigest, type PlatformFilter, type ReportKind } from '../render/model'
import { dispatch, type TargetOutcome } from './transport'

export interface PushOptions {
  /** 推送类型：digest / alert / auth */
  kind?: string
  /** 报表周期：日报 / 周报 / 月报 */
  report?: ReportKind
  /** 平台过滤 */
  platform?: PlatformFilter
  dryRun?: boolean
}

/**
 * 推送报表。
 *
 * 「我的关注」是按目标会话各自的订阅算的，所以每个目标单独构建一次 DigestModel
 * （几十个型号 × 百余天，构建成本约 10~20 ms，日频推送完全可以承受）。
 */
export async function pushDigest(
  ctx: Context,
  config: Config,
  options: PushOptions = {},
): Promise<TargetOutcome[]> {
  const kind = options.kind ?? 'digest'
  const report = options.report ?? 'daily'
  const platform = options.platform ?? 'all'

  const build = async (target: PwTarget) => {
    const watchIds = await repo.resolveWatchIds(
      ctx, target.platform, target.channelId, config.basic.maxWatchItems,
    )
    return buildDigest(ctx, config, {
      kind: report,
      platform,
      watchIds,
      maxWatch: config.basic.maxWatchItems,
    })
  }

  return dispatch(ctx, config, {
    kind,
    build,
    dryRun: options.dryRun ?? config.advanced.dryRun,
  })
}
