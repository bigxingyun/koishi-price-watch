import { Context } from 'koishi';
import type { Config } from '../index';
import type { PwModel, PwStat } from '../store/model';
/**
 * 阈值告警。
 *
 * 与日报的区别：
 * - 日报是「定时全量」，告警是「事件触发」
 * - 告警必须**短**（单条 ≤300 字符），所以只发文本，不走图片/报纸模板
 * - 告警必须**不烦人**，所以有三重去重：同型号同类 24h 一次、单目标每日上限、全局每日上限
 */
export type AlertKind = 'surge' | 'plunge' | 'newLow' | 'dailyDrop';
export interface AlertItem {
    modelId: string;
    name: string;
    price: number;
    kind: AlertKind;
    headline: string;
    detail: string;
}
/** 判断哪些型号触发了告警（纯逻辑，便于测试） */
export declare function detectAlerts(stats: PwStat[], models: PwModel[], options: {
    r7Threshold: number;
    dailyDropThreshold: number;
    newLowEnabled: boolean;
    lows: Map<string, number>;
}): AlertItem[];
/** 取每个型号最近 30 日的最低代表价 */
export declare function loadLows(ctx: Context, day?: number): Promise<Map<string, number>>;
/** 生成待发告警（已过 24h 去重） */
export declare function collectAlerts(ctx: Context, config: Config, day?: number): Promise<AlertItem[]>;
/** 把告警发给所有 alert 目标（纯文本，失败计数复用 pw_target） */
export declare function pushAlerts(ctx: Context, config: Config, options?: {
    dryRun?: boolean;
}): Promise<{
    sent: number;
    skipped: number;
}>;
