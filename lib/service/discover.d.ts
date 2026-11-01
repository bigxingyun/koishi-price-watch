import type { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 自动发现报价（L3）。
 *
 * 解决的问题：`价格 管理 采集` 以前只会采「已绑定链接」的报价，
 * 而绑定必须人工逐条做 —— 于是首次使用永远是「0 成功 0 失败 0 跳过」。
 *
 * 现在：型号库里没绑定链接的型号，按型号名去各平台搜索，取相似度最高的一个自动绑定，
 * 然后再采集。搜索接口需要登录态的平台（京东/拼多多）登不上时会如实记原因并跳过。
 */
export interface DiscoverOptions {
    /** 最多处理多少个型号（控制耗时） */
    modelLimit?: number;
    /** 相似度下限，低于它不自动绑（避免绑错商品） */
    minScore?: number;
    /** 只在这些平台尝试；不传则三个平台都试 */
    platforms?: string[];
}
export interface DiscoverResult {
    tried: number;
    bound: number;
    skipped: number;
    /** 每个平台的明细 */
    byPlatform: Record<string, {
        bound: number;
        needsLogin: number;
        noMatch: number;
    }>;
    /** 失败原因（给人看） */
    notes: string[];
}
export declare function discoverOffers(ctx: Context, config: Config, options?: DiscoverOptions): Promise<DiscoverResult>;
/** 给指令用的一行摘要 */
export declare function describeDiscover(result: DiscoverResult): string;
