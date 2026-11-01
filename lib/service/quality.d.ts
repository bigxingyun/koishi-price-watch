import type { Context } from 'koishi';
import { priceLooksSane } from '../domain/quote';
/**
 * 数据质量汇总（L3）。
 *
 * 采集链路的结论都落在 pw_snapshot.status 上，这里把它聚合成人话：
 * 今天收了多少条、多少条被质量闸门拦下、每个平台最后一次失败是什么原因。
 *
 * 用途：`价格 管理 自检` 的「数据质量」区块，以及日报脚注。
 */
export interface QualitySummary {
    day: number;
    total: number;
    ok: number;
    failed: number;
    outOfStock: number;
    delisted: number;
    suspicious: number;
    /** 每个平台最后一条失败原因 */
    lastFailures: Array<{
        platform: string;
        reason: string;
        offerId: number;
    }>;
}
export declare function qualitySummary(ctx: Context, day?: number): Promise<QualitySummary>;
/** 给日报脚注用的一行 */
export declare function qualityLine(summary: QualitySummary): string;
export { priceLooksSane };
