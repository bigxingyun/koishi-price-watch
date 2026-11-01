import { Context } from 'koishi';
import type { Config } from '../index';
import { type PlatformFilter, type ReportKind } from '../render/model';
import { type TargetOutcome } from './transport';
export interface PushOptions {
    /** 推送类型：digest / alert / auth */
    kind?: string;
    /** 报表周期：日报 / 周报 / 月报 */
    report?: ReportKind;
    /** 平台过滤 */
    platform?: PlatformFilter;
    dryRun?: boolean;
}
/**
 * 推送报表。
 *
 * 「我的关注」是按目标会话各自的订阅算的，所以每个目标单独构建一次 DigestModel
 * （几十个型号 × 百余天，构建成本约 10~20 ms，日频推送完全可以承受）。
 */
export declare function pushDigest(ctx: Context, config: Config, options?: PushOptions): Promise<TargetOutcome[]>;
