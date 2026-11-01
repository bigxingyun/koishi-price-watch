import type { Context } from 'koishi';
import type { PwModel } from '../store/model';
/**
 * 报价相关的写操作（L3 服务层）。
 *
 * P2 的目的：**指令不再直接写库**。
 * 之前 `admin.ts` 里有 5 处 `repo.upsertOffer / upsertSnapshot / addTarget ...`，
 * 于是「绑定」「录入」「推送」各自算一遍参数，改一处漏一处。
 * 现在这些写操作全部收在这里，指令只负责解析参数和回复文案。
 */
export interface BindOfferInput {
    model: PwModel;
    platform: string;
    itemId: string;
    url?: string;
    shopName?: string;
}
/** 绑定/更新一个平台的报价 */
export declare function bindOffer(ctx: Context, input: BindOfferInput): Promise<{
    created: boolean;
    id?: number;
}>;
export interface ManualPriceInput {
    model: PwModel;
    platform: string;
    yuan: number;
}
/** 人工录入今日价格：保证有报价 → 写人工价 → 写快照 → 重建聚合 */
export declare function recordManualPrice(ctx: Context, input: ManualPriceInput): Promise<{
    ok: boolean;
    reconstructed: number;
    day: number;
}>;
/** 推送目标：登记当前会话 */
export declare function addPushTarget(ctx: Context, input: {
    platform: string;
    channelId: string;
    selfId: string;
    guildId?: string;
    kind: string;
}): Promise<boolean>;
export declare function removePushTarget(ctx: Context, id: number): Promise<boolean>;
export interface SubScope {
    platform: string;
    channelId: string;
    userId: string;
}
/** 订阅某个型号（唯一的写入入口） */
export declare function subscribeModel(ctx: Context, scope: SubScope, modelId: string): Promise<boolean>;
export declare function unsubscribeModel(ctx: Context, scope: SubScope, modelId: string): Promise<boolean>;
