import { Context } from 'koishi'

import { listPlatforms } from '../adapters'
import type { Config } from '../index'
import { mountAdmin } from './admin'
import { mountPriceCommands } from './price'

/**
 * 指令装配。
 *
 * 全插件只占**一个一级指令** `price`（别名 `价格`、`p`），其余全部是它的子指令：
 *
 *   price <型号>             查价
 *   price 日报|周报|月报      报表（可加平台名、-i 出图）
 *   price 趋势|排行|型号       查询类
 *   price 关注 加|删|列表      订阅（三级）
 *   price 管理 采集|自检|…     管理（三级）
 *
 * 中英文各注册一份同名子指令（见 register.ts），因为 Koishi 的 alias 不会跨层拼接。
 */
export function mountCommands(ctx: Context, config: Config, isReady: () => boolean) {


  ctx.command('price.ping', '连通性自检')
    .alias('连通')
    .action(() => [
      'pong',
      `数据库=${ctx.database ? 'ok' : 'missing'}`,
      `插件就绪=${isReady() ? 'yes' : 'no'}`,
      `平台=${listPlatforms().join('/')}`,
      `node=${process.version}`,
    ].join(' · '))

  mountPriceCommands(ctx, config)
  mountAdmin(ctx, config, isReady)
}
