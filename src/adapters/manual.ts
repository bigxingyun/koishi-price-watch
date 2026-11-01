import { Context } from 'koishi'

import { STATUS } from '../constants'
import { isSanePrice, parsePrice } from '../crawler/normalize'
import type { Adapter } from '../crawler/types'
import * as repo from '../store/repo'

/**
 * 人工录入适配器：主人用 `price admin set` 写进来的价格，从这里读。
 *
 * 存在 pw_meta 的 `manual:{offerId}:{day}` 里，值就是「元」文本。
 * 这条通道完全合规、零网络，冷启动与平台拿不到数据时是唯一可靠来源。
 */
export const manualAdapter: Adapter = {
  platform: 'manual',

  async fetch(job) {
    const raw = await repo.metaGet(job.ctx, `manual:${job.offer.id}:${job.day}`)
    if (!raw) {
      return { price: 0, status: STATUS.FAILED, note: `今日未人工录入（price admin set ${job.model.name} ...）` }
    }
    const price = parsePrice(raw)
    if (!price || !isSanePrice(price)) {
      return { price: 0, status: STATUS.FAILED, note: `人工录入的值无法解析：${raw}` }
    }
    return { price, status: STATUS.OK, note: 'manual' }
  },
}

/** 写入一条人工价格（元），供指令调用 */
export async function setManualPrice(
  ctx: Context,
  offerId: number,
  day: number,
  yuan: number,
): Promise<void> {
  await repo.metaSet(ctx, `manual:${offerId}:${day}`, String(yuan))
}
