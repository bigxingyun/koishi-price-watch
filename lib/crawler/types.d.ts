import type { Context } from 'koishi';
import type { Config } from '../index';
import type { PwModel, PwOffer } from '../store/model';
/** 采集任务的输入 */
export interface AdapterJob {
    ctx: Context;
    config: Config;
    offer: PwOffer;
    model: PwModel;
    day: number;
}
/** 一次采集的结果 */
export interface Quote {
    /** 到手价（分） */
    price: number;
    /** 标价（分），可选 */
    listPrice?: number;
    /** STATUS.* */
    status: number;
    /** 解析失败/降级原因的简短说明，写进日志 */
    note?: string;
}
export declare class FetchError extends Error {
    readonly status: number;
    readonly url: string;
    constructor(message: string, status?: number, url?: string);
}
/** 解析失败（页面结构变了 / 价格被混淆） */
export declare class ParseError extends Error {
    readonly sample: string;
    constructor(message: string, sample?: string);
}
/** 登录态失效 / 验证码：需要熔断并通知主人 */
export declare class AuthError extends Error {
    readonly platform: string;
    constructor(message: string, platform?: string);
}
export interface Adapter {
    platform: string;
    /** 是否需要浏览器（决定采集时是否 lease 浏览器池） */
    needsBrowser?: boolean;
    fetch(job: AdapterJob): Promise<Quote>;
}
