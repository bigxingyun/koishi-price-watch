/** 全局常量与日期工具：零依赖，只用原生 Date */
export type Category = 'gpu' | 'ram' | 'ssd';
export declare const CATEGORIES: Category[];
export declare const CATEGORY_LABEL: Record<Category, string>;
/** 快照状态码 */
export declare const STATUS: {
    readonly OK: 0;
    readonly OUT_OF_STOCK: 1;
    readonly DELISTED: 2;
    readonly FAILED: 3;
    readonly SUSPICIOUS: 4;
};
export declare const DAY_MS = 86400000;
/** 价格一律以「分」为整数单位存储，避免浮点 */
export declare function toCents(yuan: number): number;
export declare function toYuan(cents: number): number;
/** Date → YYYYMMDD 整数（用本地时区，与用户看到的日期一致） */
export declare function toDay(date?: Date): number;
/** YYYYMMDD → 当天 00:00 的 Date */
export declare function fromDay(day: number): Date;
/** a 比 b 晚多少天（a - b） */
export declare function diffDays(a: number, b: number): number;
/** day 往前推 n 天 */
export declare function shiftDay(day: number, n: number): number;
export declare function formatDay(day: number): string;
export declare const WEEKDAY: string[];
/** 中文数字期号（第 001 期） */
export declare function issueNo(day: number, baseDay: number): string;
/** 中位数（不改原数组） */
export declare function median(values: number[]): number;
/** 截尾均值：去掉最高最低各一个（n≥3 时） */
export declare function trimmedMean(values: number[]): number;
export declare function mean(values: number[]): number;
/** 样本标准差（n-1 分母，n<2 时返回 0） */
export declare function stdev(values: number[]): number;
export declare function clamp(x: number, lo: number, hi: number): number;
export declare function round(x: number, digits?: number): number;
/** 金额格式化：分 → ¥6,299 */
export declare function money(cents: number): string;
/** 金额格式化（不带货币符号）：分 → 6,299 */
export declare function moneyPlain(cents: number): string;
