import { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 数据治理：保留期清理。
 *
 * 设计文档 §1.5 承诺的是「明细 → 周聚合 → 冷却删除」三级生命周期。
 * 当前实现只做**分批删除**（不做周聚合表），因为：
 * - 22k 行/年的量级下，周聚合带来的收益为负（多一张表、多一处算法迁移成本）
 * - 真正需要控体积的是快照明细，而它已经按天唯一
 * 这条差异在 readme 与设计文档里如实标注，不假装实现了降采样。
 */
export interface GcResult {
    snapshots: number;
    daily: number;
    manual: number;
    dryRun: boolean;
    cutoff: {
        snapshot: number;
        daily: number;
    };
}
export declare function gc(ctx: Context, config: Config, options?: {
    dryRun?: boolean;
    batchDays?: number;
}): Promise<GcResult>;
/** 各表行数与数据库文件体积（doctor 用） */
export declare function stats(ctx: Context): Promise<Array<{
    table: string;
    rows: number;
}>>;
