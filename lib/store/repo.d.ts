import { Context } from 'koishi';
import { type Category } from '../constants';
import type { PwDaily, PwModel, PwOffer, PwSnapshot, PwStat, PwSub, PwTarget } from './model';
/** 查询归一化：小写 + 去空格 + 全角括号统一 */
export declare function normalizeQuery(input: string): string;
export declare function countModels(ctx: Context): Promise<number>;
export declare function listModels(ctx: Context, category?: Category): Promise<PwModel[]>;
export declare function getModel(ctx: Context, id: string): Promise<PwModel | undefined>;
export interface ModelMatch {
    model: PwModel;
    score: number;
}
/**
 * 模糊匹配型号。手写打分，不引第三方模糊匹配库：
 * 精确 id > 精确 name > 精确 alias > 互相包含 > alias 包含。
 */
export declare function searchModels(ctx: Context, query: string, limit?: number): Promise<ModelMatch[]>;
export declare function upsertModel(ctx: Context, row: Omit<PwModel, 'createdAt'> & {
    createdAt?: Date;
}): Promise<boolean>;
export declare function removeModel(ctx: Context, id: string): Promise<boolean>;
export declare function countOffers(ctx: Context): Promise<number>;
export declare function listOffers(ctx: Context, modelId?: string): Promise<PwOffer[]>;
/** 唯一键是 (platform, itemId)，所以先按唯一键 set，未命中再 create —— 幂等重跑 */
export declare function upsertOffer(ctx: Context, row: Omit<PwOffer, 'id' | 'createdAt'> & {
    createdAt?: Date;
}): Promise<boolean>;
/** 唯一键是 (offerId, day)：同一天重跑只覆盖，不新增行 */
export declare function upsertSnapshot(ctx: Context, row: Omit<PwSnapshot, 'id' | 'ts'> & {
    ts?: Date;
}): Promise<boolean>;
export declare function getSnapshots(ctx: Context, modelIds: string[], sinceDay: number): Promise<PwSnapshot[]>;
/** 按 offer 取最近 N 天成功快照（用于算「到手价」与平台报价对照） */
export declare function getRecentSnapshots(ctx: Context, sinceDay: number): Promise<PwSnapshot[]>;
/** 该 offer 在 beforeDay 之前最近一次成功价（用于异常值判定） */
export declare function getLastOkPrice(ctx: Context, offerId: number, beforeDay: number): Promise<number | undefined>;
export declare function upsertDaily(ctx: Context, row: Omit<PwDaily, 'id'>): Promise<void>;
export declare function getDaily(ctx: Context, modelIds: string[], sinceDay: number): Promise<PwDaily[]>;
export declare function upsertStat(ctx: Context, row: Omit<PwStat, 'updatedAt'>): Promise<void>;
export declare function getAllStats(ctx: Context): Promise<PwStat[]>;
export declare function getStat(ctx: Context, modelId: string): Promise<PwStat | undefined>;
export declare function listTargets(ctx: Context, kind?: string): Promise<PwTarget[]>;
export interface TargetInput {
    platform: string;
    channelId: string;
    selfId?: string;
    guildId?: string;
    kind: string;
    mode: string;
}
/** 唯一键是 (platform, selfId, channelId, kind) */
export declare function addTarget(ctx: Context, input: TargetInput): Promise<boolean>;
export declare function removeTarget(ctx: Context, id: number): Promise<boolean>;
export declare function markTargetFailed(ctx: Context, id: number, failCount: number): Promise<void>;
/** 首次启动时把配置里的 targets 作为种子导入（表里已有数据则完全不动） */
export declare function seedTargets(ctx: Context, seeds: TargetInput[]): Promise<number>;
export interface SubInput {
    platform: string;
    channelId: string;
    userId: string;
    modelId: string;
    kind: string;
    threshold: number;
}
/** 唯一键是 (platform, channelId, userId, modelId, kind) */
export declare function addSub(ctx: Context, input: SubInput): Promise<boolean>;
export declare function removeSub(ctx: Context, platform: string, channelId: string, modelId: string): Promise<boolean>;
export declare function listSubs(ctx: Context, platform?: string, channelId?: string): Promise<PwSub[]>;
/**
 * 某个会话订阅的型号 id 列表（含 `gpu:*` 这种整组订阅的展开）。
 * 日报的「我的关注」用它。
 */
export declare function resolveWatchIds(ctx: Context, platform: string, channelId: string, limit?: number): Promise<string[]>;
export declare function metaGet(ctx: Context, key: string): Promise<string | undefined>;
export declare function metaSet(ctx: Context, key: string, value: string): Promise<void>;
export declare function metaDel(ctx: Context, key: string): Promise<void>;
