import { Context } from 'koishi';
import type { Category } from '../constants';
import type { Config } from '../index';
export declare const PLATFORM_LABEL: Record<string, string>;
/** 报表周期 */
export type ReportKind = 'daily' | 'weekly' | 'monthly';
/** 平台过滤：all 表示全平台 */
export type PlatformFilter = 'all' | string;
export declare const REPORT_META: Record<ReportKind, {
    label: string;
    changeLabel: string;
    windowDays: number;
    title: string;
}>;
export interface DigestOffer {
    platform: string;
    label: string;
    price: number | null;
    /** 店铺名（品牌旗舰店 / 第三方店），报表里要显示 */
    shopName?: string;
}
export interface DigestItem {
    modelId: string;
    name: string;
    category: Category;
    /** 期末价（日报即现价） */
    price: number;
    open: number;
    high: number;
    low: number;
    /** 周期涨跌幅 */
    change: number;
    /** 上一周期涨跌幅，用于「较上期」 */
    prevChange: number | null;
    /** 最近一日涨跌 */
    d1: number;
    /** 周期内区间位置 0~1 */
    pos: number;
    streak: number;
    label: string;
    grade: string;
    modifier: string;
    confidence: string;
    r30: number;
    q30: number;
    offers: DigestOffer[];
    trend: number[];
    degrade?: {
        kind: 'coldstart' | 'stale';
        detail: string;
    };
}
export interface DigestIndex {
    category: Category;
    label: string;
    value: number;
    change: number;
    prevChange: number | null;
    q30: number;
    zone: string;
    r30: number;
}
export interface CompareItem {
    name: string;
    items: DigestOffer[];
    spread: number;
    lowest: string;
}
export interface PeriodInfo {
    kind: ReportKind;
    label: string;
    changeLabel: string;
    title: string;
    startDay: number;
    endDay: number;
    rangeText: string;
    platform: PlatformFilter;
    platformLabel: string;
}
export interface DigestModel {
    day: number;
    dateText: string;
    issue: string;
    period: PeriodInfo;
    health: {
        total: number;
        ok: number;
        failed: number;
        note?: string;
    };
    indexes: DigestIndex[];
    /** 全部型号（按价格降序），分品类出图时按 category 过滤 */
    items: DigestItem[];
    movers: DigestItem[];
    compare: CompareItem[];
    watch: DigestItem[];
    footer: {
        models: number;
        quotes: number;
        costMs: number;
    };
    theme: 'newspaper' | 'marble' | 'pixel';
    colorScheme: 'cn' | 'intl';
}
export interface BuildOptions {
    kind?: ReportKind;
    platform?: PlatformFilter;
    day?: number;
    topMovers?: number;
    maxWatch?: number;
    compareThreshold?: number;
    watchIds?: string[];
    costMs?: number;
}
/** 解析平台别名（中文/英文/简写都能认） */
export declare function parsePlatform(input?: string): PlatformFilter;
/**
 * 组装报表数据模型。
 *
 * 相比早期版本的两个关键变化：
 * - `kind`：日报 / 周报 / 月报（滚动 1 / 7 / 30 日），周期语义贯穿所有字段
 * - `platform`：只看单个平台时，代表价只由该平台的报价聚合，比价段自动隐藏
 *
 * 指标全部在内存里按需计算（几十型号 × 百余天）。
 * 好处是「周期 × 平台」的组合天然成立，不必为每种组合预建聚合表；
 * `pw_daily` / `pw_stat` 仍然保留，给需要毫秒级响应的单型号查询用。
 */
export declare function buildDigest(ctx: Context, config: Config, options?: BuildOptions): Promise<DigestModel>;
/** 取某型号一段时间内的价格序列（trend 指令与单平台模式用） */
export declare function seriesOf(ctx: Context, modelId: string, days: number, platform?: PlatformFilter): Promise<number[]>;
