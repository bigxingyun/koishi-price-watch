import { Context } from 'koishi';
export interface DemoOptions {
    /** 生成多少天的历史（默认 40，保证 30 日指标与 7 日涨跌都有数据） */
    days?: number;
    /** 只生成前 N 个型号 */
    limit?: number;
}
export declare function seedDemo(ctx: Context, options?: DemoOptions): Promise<{
    offers: number;
    snapshots: number;
}>;
