import type { Context } from 'koishi';
/**
 * HTTP 抓取封装：只管「发请求 + 超时 + 重试 + 伪装 UA」，不做任何平台特定的事。
 *
 * 用 ctx.http（cordis 的 http 服务）而不是裸 axios：
 * 它随插件卸载自动 abort，不会留下悬挂请求。
 */
export declare const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
export declare const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
export interface FetchOptions {
    headers?: Record<string, string>;
    timeout?: number;
    /** 失败重试次数（不含首次） */
    retries?: number;
    ua?: string;
}
export interface FetchResponse {
    url: string;
    body: string;
}
export declare function fetchText(ctx: Context, url: string, options?: FetchOptions): Promise<FetchResponse>;
export declare function sleep(ms: number): Promise<void>;
/** 随机抖动：让请求节奏看起来不像脚本 */
export declare function jitter(min: number, max: number): number;
