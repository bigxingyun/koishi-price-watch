export interface PricePoint {
    day: number;
    price: number;
}
/** STS 阈值（可用配置覆盖，这里给默认值） */
export declare const STS: {
    readonly sharpUp: 0.08;
    readonly up: 0.03;
    readonly down: -0.03;
    readonly sharpDown: -0.08;
    readonly volatileCv: 0.06;
};
/** LPRS 阈值 */
export declare const LPRS: {
    readonly lowS: 0.2;
    readonly lowA: 0.35;
    readonly highC: 0.65;
    readonly highD: 0.8;
    readonly strongUp: 0.06;
    readonly weakUp: 0.02;
    readonly strongDown: -0.06;
    readonly weakDown: -0.02;
    readonly cvGood: 0.1;
    readonly cvPoor: 0.2;
    readonly minSamples: 21;
    readonly fullSamples: 30;
};
export type Label7 = '急涨' | '上涨' | '横盘' | '下跌' | '急跌' | '样本不足';
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export type Confidence = '高' | '中' | '低';
export type Modifier = '↓↓' | '↓' | '→' | '↑' | '↑↑';
export interface ShortResult {
    n: number;
    /** 7 日涨跌幅（-1..1）；样本不足时为 null */
    r7: number | null;
    /** 7 日区间位置（0=最低，1=最高） */
    pos7: number | null;
    /** 7 日变异系数 */
    cv7: number | null;
    /** 连续同向天数：正=连涨，负=连跌 */
    streak: number;
    label: Label7;
    mode: 'full' | 'accumulated' | 'insufficient';
    /** 累计变化（首日→今日），冷启动阶段用它替代 r7 */
    accumulated: number | null;
}
export interface LongResult {
    /** 是否有足够样本给出 LPRS 结论（n≥21） */
    available: boolean;
    n30: number;
    ma30: number;
    r30: number;
    q30: number;
    /** Theil–Sen 月化趋势（相对均价的百分比/月） */
    m30: number;
    cv30: number;
    grade: Grade;
    modifier: Modifier;
    confidence: Confidence;
}
/**
 * 短期信号（7 日）。
 *
 * 降级规则（设计文档 §1.6）：
 * - n ≥ 5 且有 7 日基准 → full
 * - 2 ≤ n < 5 或无 7 日基准 → accumulated（用首日→今日的累计变化，并且不出 7 日标签）
 * - n < 2 → insufficient
 */
export declare function computeShort(raw: PricePoint[]): ShortResult;
/**
 * 30 日分位：当前价在样本中的百分位（0=最低，1=最高）。
 * 相同价格按「各占一半」处理，避免大量重复值把分位推向极端。
 */
export declare function percentileRank(current: number, history: number[]): number;
/**
 * Theil–Sen 中位斜率：所有点对斜率的中位数。
 * 比最小二乘抗离群点（秒杀断崖、大促台阶），这是选它的唯一理由。
 */
export declare function theilSen(xs: number[], ys: number[]): number;
/**
 * 长期价格区间标准（LPRS，30 日）。
 * 四个维度缺一不可：基准偏离、历史分位、趋势斜率、波动。
 */
export declare function computeLong(raw: PricePoint[]): LongResult;
/**
 * 品类指数：等权几何平均，以首采价为 100。
 * 几何平均可避免高价型号（显卡）主导指数。
 */
export declare function categoryIndex(pairs: Array<{
    base: number;
    current: number;
}>): number;
/** 从价格序列里取某型号的「代表价」：默认中位数，offer 数≥3 时用截尾均值 */
export declare function representativePrice(prices: number[]): number;
