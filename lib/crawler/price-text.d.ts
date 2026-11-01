/**
 * 从页面正文里挑出「最可能是商品价」的那个数字。
 *
 * 为什么不能「匹配第一个 ¥」：拼多多同一页面在不同渲染下，正文里
 * ¥ 的先后顺序不一样 —— 有时第一处是「大促价 ¥12599」，有时先出现
 * 「¥1」「¥9.9」这类件数/优惠噪声。按位置取就会取错。
 *
 * 策略：
 *   1. 把所有「上下文词 + ¥数字」都收集起来
 *   2. 只要 100–200000 区间内的（排除件数、优惠、分期）
 *   3. 优先带价格关键词的（大促价/券后/拼单价/秒杀价）
 *   4. 否则取中位数，避免被单个极端值带偏
 */
export interface PriceCandidate {
    /** ¥ 前面的上下文词，例如「大促价」「券后」 */
    ctx: string;
    price: number;
}
/** 页面里执行：收集所有价格候选（返回 JSON 字符串，便于跨进程传递） */
export declare const COLLECT_PRICES_JS: string;
/** 纯函数：从候选里挑一个可信价格（可单测） */
export declare function pickPrice(candidates: PriceCandidate[]): {
    price: number;
    reason?: string;
};
