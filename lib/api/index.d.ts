import type { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 三个开放平台的价格查询。
 *
 * 说明：这些接口**必须有账号密钥**才能调用，没有密钥时这里会明确报「未配置」，
 * 不会假装成功。密钥从插件配置 `api.jd` / `api.pdd` / `api.taobao` 读。
 *
 * 统一返回 `ApiPrice`，由上层适配器转成 Quote。
 */
export interface ApiPrice {
    price: number;
    shopName?: string;
    title?: string;
    /** 券后价还是标价，用来说明 */
    note?: string;
}
export interface ApiOutcome {
    ok: boolean;
    price?: ApiPrice;
    message: string;
}
export declare function apiReady(config: Config, platform: string): boolean;
/** 京东联盟：按 skuId 查商品（返回券后价） */
export declare function jdApiPrice(ctx: Context, config: Config, skuId: string): Promise<ApiOutcome>;
/** 多多进宝：按 goods_id 查商品 */
export declare function pddApiPrice(ctx: Context, config: Config, goodsId: string): Promise<ApiOutcome>;
/** 淘宝客：按 num_iid 查商品 */
export declare function taobaoApiPrice(ctx: Context, config: Config, itemId: string): Promise<ApiOutcome>;
export declare function apiPrice(ctx: Context, config: Config, platform: string, itemId: string): Promise<ApiOutcome>;
