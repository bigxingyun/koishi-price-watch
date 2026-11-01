import { Context } from 'koishi';
import type { Adapter } from '../crawler/types';
/**
 * 人工录入适配器：主人用 `price admin set` 写进来的价格，从这里读。
 *
 * 存在 pw_meta 的 `manual:{offerId}:{day}` 里，值就是「元」文本。
 * 这条通道完全合规、零网络，冷启动与平台拿不到数据时是唯一可靠来源。
 */
export declare const manualAdapter: Adapter;
/** 写入一条人工价格（元），供指令调用 */
export declare function setManualPrice(ctx: Context, offerId: number, day: number, yuan: number): Promise<void>;
