import type { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 仿真发现（L3）：搜索 → 点商品卡 → 从落地页读数 → 自动建立报价。
 *
 * 为什么要有它：之前「必须先绑定链接才能采集」是设计遗留。
 * 仿真本来就是「像人一样搜、点、看」，那么顺手就能拿到 id / 标题 / 价格，
 * 根本不需要用户先贴链接。
 *
 * 各平台已验证的情况：
 *   拼多多  search_result.html → 点卡 → 落地 goods.html?goods_id=… → 有价（实测 ¥7,888）
 *   淘宝    s.m.taobao.com/h5 → 点卡 → 落地 item.taobao.com/item.htm?id=…（需登录态）
 *   京东    search.jd.com（PC）→ 登录后才可用
 */
export interface SimulateOptions {
    /** 只处理这些平台 */
    platforms?: string[];
    /** 最多处理多少个型号（控制耗时） */
    modelLimit?: number;
}
export interface SimulateResult {
    tried: number;
    bound: number;
    priced: number;
    byPlatform: Record<string, {
        bound: number;
        priced: number;
        failed: number;
        note?: string;
    }>;
    notes: string[];
}
export declare function discoverBySimulation(ctx: Context, config: Config, options?: SimulateOptions): Promise<SimulateResult>;
export declare function describeSimulate(result: SimulateResult): string;
