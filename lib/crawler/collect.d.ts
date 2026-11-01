import { Context } from 'koishi';
import type { Config } from '../index';
export interface CollectOptions {
    day?: number;
    /** 只跑这些平台 */
    platforms?: string[];
    /** 只补当日失败/缺失的报价 */
    onlyMissing?: boolean;
    /** 忽略「今日已成功」的去重（强制重采） */
    force?: boolean;
    limit?: number;
}
export interface PlatformStat {
    ok: number;
    failed: number;
    skipped: number;
    blocked?: string;
}
export interface CollectResult {
    day: number;
    total: number;
    ok: number;
    failed: number;
    skipped: number;
    /** 跳过原因分类：看得懂才知道下一步做什么 */
    skipReasons: {
        noItemId: number;
        alreadyDone: number;
        manual: number;
    };
    /** 需要用户知道的事（例如「某平台需要登录，已发出二维码」） */
    notes: string[];
    platforms: Record<string, PlatformStat>;
    /** daily / stat 重建行数 */
    rebuilt: {
        daily: number;
        stat: number;
    };
    elapsedMs: number;
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
export declare function runCollect(ctx: Context, config: Config, options?: CollectOptions): Promise<CollectResult>;
