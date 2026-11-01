import { Context } from 'koishi';
/** 日聚合回看窗口：730 天足够覆盖 30 日指标 + 一年对比 */
export declare const DAILY_WINDOW = 730;
export interface RebuildOptions {
    modelIds?: string[];
    /** 只重算这一天之后的数据（增量）；不传则全窗口重算 */
    sinceDay?: number;
    today?: number;
}
/**
 * 重建 pw_daily（型号 × 日）。派生数据，可随时重算。
 * 每天独立计算，因此支持从某天开始增量重建。
 */
export declare function rebuildDaily(ctx: Context, options?: RebuildOptions): Promise<number>;
/**
 * 重建 pw_stat（每型号 1 行）。依赖 pw_daily。
 * 写时预计算：查询与推送都只读这一行，不再现算 30 日窗口。
 */
export declare function rebuildStat(ctx: Context, options?: {
    modelIds?: string[];
    today?: number;
}): Promise<number>;
export declare function rebuildAll(ctx: Context, modelIds?: string[]): Promise<{
    daily: number;
    stat: number;
}>;
