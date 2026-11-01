import type { Context } from 'koishi';
import type { Config } from '../index';
import type { PwModel, PwOffer } from '../store/model';
import { type QuoteResult, type QuoteSource } from '../domain/quote';
/**
 * 采集一个报价（L3 服务层，唯一入口）。
 *
 * 这里做三件事，且只做这三件：
 *   1. 决定数据源（api / browser / manual）—— 调 source 的策略
 *   2. 调对应提供者 —— api 走联盟，browser 走适配器
 *   3. 把一切结果/异常收敛成 QuoteResult（含 reason / evidence / 耗时）
 *
 * 上层（collect 循环、指令、自检）只看 QuoteResult，不再自己判错。
 */
export interface CollectOneInput {
    ctx: Context;
    config: Config;
    offer: PwOffer;
    model: PwModel;
    day: number;
}
export declare function collectOne(input: CollectOneInput): Promise<QuoteResult>;
export type { QuoteResult, QuoteSource };
