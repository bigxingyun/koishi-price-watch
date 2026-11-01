import type { Context } from 'koishi'

import { toCents, toDay } from '../constants'
import { setManualPrice } from '../adapters/manual'
import { rebuildAll } from '../store/aggregate'
import * as repo from '../store/repo'
import type { PwModel } from '../store/model'

/**
 * 报价相关的写操作（L3 服务层）。
 *
 * P2 的目的：**指令不再直接写库**。
 * 之前 `admin.ts` 里有 5 处 `repo.upsertOffer / upsertSnapshot / addTarget ...`，
 * 于是「绑定」「录入」「推送」各自算一遍参数，改一处漏一处。
 * 现在这些写操作全部收在这里，指令只负责解析参数和回复文案。
 */

export interface BindOfferInput {
  model: PwModel
  platform: string
  itemId: string
  url?: string
  shopName?: string
}

/** 绑定/更新一个平台的报价 */
export async function bindOffer(ctx: Context, input: BindOfferInput): Promise<{ created: boolean; id?: number }> {
  const created = await repo.upsertOffer(ctx, {
    modelId: input.model.id,
    platform: input.platform,
    shopId: '',
    shopName: input.shopName ?? '',
    itemId: input.itemId,
    url: input.url ?? '',
    title: input.model.name,
    active: true,
  })
  const offers = await repo.listOffers(ctx, input.model.id)
  const offer = offers.find((o) => o.platform === input.platform && o.itemId === input.itemId)
  return { created, id: offer?.id }
}

export interface ManualPriceInput {
  model: PwModel
  platform: string
  yuan: number
}

/** 人工录入今日价格：保证有报价 → 写人工价 → 写快照 → 重建聚合 */
export async function recordManualPrice(
  ctx: Context,
  input: ManualPriceInput,
): Promise<{ ok: boolean; reconstructed: number; day: number }> {
  const { model, platform, yuan } = input
  const day = toDay()

  let offers = await repo.listOffers(ctx, model.id)
  let offer = offers.find((o) => o.platform === platform)
  if (!offer) {
    await repo.upsertOffer(ctx, {
      modelId: model.id,
      platform,
      shopId: '',
      shopName: '',
      // 人工录入用的占位 ID：含数字，避免被采集器当成「没绑定真实链接」而误采
      itemId: `${platform}-${Date.now()}`,
      url: '',
      title: model.name,
      active: true,
    })
    offers = await repo.listOffers(ctx, model.id)
    offer = offers.find((o) => o.platform === platform)
  }
  if (!offer) return { ok: false, reconstructed: 0, day }

  await setManualPrice(ctx, offer.id, day, yuan)
  await repo.upsertSnapshot(ctx, {
    offerId: offer.id,
    modelId: model.id,
    day,
    price: toCents(yuan),
    listPrice: toCents(yuan),
    status: 0,
    samples: 1,
  })
  const rebuilt = await rebuildAll(ctx, [model.id])
  return { ok: true, reconstructed: rebuilt.daily, day }
}

/** 推送目标：登记当前会话 */
export async function addPushTarget(
  ctx: Context,
  input: { platform: string; channelId: string; selfId: string; guildId?: string; kind: string },
): Promise<boolean> {
  return repo.addTarget(ctx, {
    platform: input.platform,
    channelId: input.channelId,
    selfId: input.selfId,
    guildId: input.guildId,
    kind: input.kind,
    mode: 'auto',
  })
}

export async function removePushTarget(ctx: Context, id: number): Promise<boolean> {
  return repo.removeTarget(ctx, id)
}

export interface SubScope {
  platform: string
  channelId: string
  userId: string
}

/** 订阅某个型号（唯一的写入入口） */
export async function subscribeModel(ctx: Context, scope: SubScope, modelId: string): Promise<boolean> {
  return repo.addSub(ctx, {
    platform: scope.platform,
    channelId: scope.channelId,
    userId: scope.userId,
    modelId,
    kind: 'digest',
    threshold: 0,
  })
}

export async function unsubscribeModel(ctx: Context, scope: SubScope, modelId: string): Promise<boolean> {
  return repo.removeSub(ctx, scope.platform, scope.channelId, modelId)
}
