import type { Context } from 'koishi';
import { type Quote } from '../crawler/types';
/**
 * 统一数据契约（L0 领域层）。
 *
 * 为什么要有它：适配器各自抛错、各自返回 note，导致「为什么没拿到价」永远说不清。
 * 现在所有采集路径都收敛成这一个结构，**失败原因只有一个表述方式**。
 *
 * 依赖方向：领域层不 import 任何上层（services / commands / render）。
 */
export type QuoteStatus = 'ok' | 'out_of_stock' | 'delisted' | 'auth_required' | 'blocked' | 'parse_failed' | 'suspicious';
export type QuoteSource = 'api' | 'browser' | 'manual' | 'mock';
export interface QuoteResult {
    ok: boolean;
    /** 到手价（元，两位小数）；失败时无 */
    price?: number;
    listPrice?: number;
    shopName?: string;
    title?: string;
    status: QuoteStatus;
    source: QuoteSource;
    /** 给人看的一句话原因；成功时留空 */
    reason?: string;
    /** 排查证据：接口名 / 页面 URL / 正则命中位置 */
    evidence?: string;
    /** 耗时（毫秒） */
    costMs?: number;
}
export declare const PRICE_FLOOR_YUAN = 1;
export declare const PRICE_CEIL_YUAN = 200000;
/** 价格本身是否像一个正常价格（不合法就绝不入库） */
export declare function priceLooksSane(priceYuan: number): boolean;
/** 失败状态 → 数据库里的 status 数字 */
export declare function statusCodeOf(status: QuoteStatus): number;
/**
 * 异常 → 统一状态。这是「一眼看出为什么失败」的核心：
 * 任何适配器只要按约定抛这三种错，这里就会给出确定的分类。
 */
export declare function classifyError(error: unknown): {
    status: QuoteStatus;
    reason: string;
};
/** 把适配器返回的 Quote（分）转成领域层的 QuoteResult（元） */
export declare function fromQuote(quote: Quote, source: QuoteSource, costMs?: number): QuoteResult;
/** 成功结果 → 写库用的行（唯一出口，避免各处自己算分） */
export declare function toSnapshotRow(result: QuoteResult, offerId: number, modelId: string, day: number): {
    offerId: number;
    modelId: string;
    day: number;
    price: number;
    listPrice: number;
    status: number;
    samples: number;
};
/** 无副作用的诊断行，用于日志与自检 */
export declare function describeResult(result: QuoteResult): string;
export type { Context };
/**
 * 价格是否异常偏离历史中位数。
 *
 * 质量闸门原来只拦 0 元和天文数字，但「8999 的卡突然变 1150」这类明显错误
 * （抓到了分期/优惠/配件价）会当成真价格写进报表，所以补一次相对判断。
 *   - 历史不足 3 个点：不判断（避免冷启动误杀）
 *   - 偏离超过阈值：标记可疑，采集层不入库
 */
export interface OutlierCheck {
    outlier: boolean;
    median: number;
    deviation: number;
    reason?: string;
}
export declare function priceOutlier(history: number[], priceYuan: number, threshold?: number): OutlierCheck;
/**
 * 商家常用套路：标题写「RTX 5070」，实际 SKU 是 2060/3060，用低价把你骗进去。
 * 这里从标题里抽出型号代号，和目标型号比对，不一致就拒绝入库。
 */
export interface ModelMatch {
    matches: boolean;
    expected: string;
    found: string[];
    reason?: string;
}
export declare function modelMatches(expectedName: string, actualText: string): ModelMatch;
