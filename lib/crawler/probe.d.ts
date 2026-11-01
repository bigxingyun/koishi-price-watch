import { Context } from 'koishi';
import type { Config } from '../index';
import { MOBILE_UA } from './fetcher';
/**
 * 页面诊断：把浏览器真正看到的东西吐出来（地址、标题、价格候选、正文开头）。
 *
 * 用途：当「采集失败」时，不用猜是被登录墙挡了、还是选择器过期了、还是价格被混淆了。
 * `价格 管理 诊断 京东 <商品ID>` 直接调它。
 */
export interface PageProbe {
    ok: boolean;
    href: string;
    title: string;
    priceTexts: string[];
    bodyHead: string;
    error?: string;
    elapsedMs: number;
}
export declare function probePage(ctx: Context, config: Config, url: string, options?: {
    waitMs?: number;
}): Promise<PageProbe>;
/** 平台 → 商品页 URL */
export declare function offerUrl(platform: string, itemId: string): string;
/** 判断页面是否落在登录域 */
export declare function isLoginDomain(href: string): boolean;
export { MOBILE_UA };
