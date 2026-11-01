import type { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 平台内搜索。
 *
 * 为什么需要它：型号名跟商品 ID 之间没有可推导关系。
 * 以前把型号名直接拼进 `goods.html?goods_id=`，拼出 `pdd-gpu:rtx5090-32g`
 * 这种假 ID，页面只会回「商品不存在」。
 *
 * 实测（2026-10）：
 * - 淘宝 `s.m.taobao.com` 未登录也能搜，结果在 `<a href>` 里
 * - 拼多多 `search_result.html` **直接重定向到登录页**
 * - 京东 `so.m.jd.com` 同样被拦
 *
 * 所以返回值必须区分「没搜到」和「需要登录」，否则永远说不清为什么空。
 */
export interface SearchHit {
    itemId: string;
    title: string;
    url: string;
    score: number;
}
export interface SearchResult {
    hits: SearchHit[];
    /** 搜索页被重定向到登录页 */
    needsLogin: boolean;
    note?: string;
}
export declare function searchUrlOf(platform: string, keyword: string): string | null;
/**
 * 标题与关键词的相似度（0~1）。
 * 型号里的数字权重更高：5070 和 5080 的中文部分完全一样，只有数字能区分。
 */
export declare function scoreTitle(keyword: string, title: string): number;
export declare function searchPlatform(ctx: Context, config: Config, platform: string, keyword: string, limit?: number): Promise<SearchResult>;
/** 记住「等登录后再搜一次」的请求 */
export declare function queueSearch(ctx: Context, platform: string, keyword: string): Promise<void>;
export interface PendingSearchResult {
    platform: string;
    keyword: string;
    text: string;
}
/** 登录成功后调用：把挂起的搜索真的跑一遍 */
export declare function runPendingSearch(ctx: Context, config: Config): Promise<PendingSearchResult | null>;
