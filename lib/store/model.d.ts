import { Context } from 'koishi';
declare module 'koishi' {
    interface Tables {
        pw_model: PwModel;
        pw_offer: PwOffer;
        pw_snapshot: PwSnapshot;
        pw_daily: PwDaily;
        pw_stat: PwStat;
        pw_sub: PwSub;
        pw_target: PwTarget;
        pw_meta: PwMeta;
    }
}
/** 型号（人工维护的分析单位） */
export interface PwModel {
    id: string;
    category: string;
    brand: string;
    name: string;
    spec: object;
    aliases: string[];
    inIndex: boolean;
    priority: number;
    createdAt: Date;
}
/** 平台报价（采集单位，白名单 URL） */
export interface PwOffer {
    id: number;
    modelId: string;
    platform: string;
    shopId: string;
    /** 店铺名（品牌旗舰店 / 第三方店） */
    shopName: string;
    itemId: string;
    url: string;
    title: string;
    active: boolean;
    createdAt: Date;
}
/** 日快照（唯一写入表：每 offer 每天 1 行） */
export interface PwSnapshot {
    id: number;
    offerId: number;
    modelId: string;
    day: number;
    price: number;
    listPrice: number;
    status: number;
    samples: number;
    ts: Date;
}
/** 型号 × 日 聚合（派生，可重建） */
export interface PwDaily {
    id: number;
    modelId: string;
    day: number;
    low: number;
    high: number;
    median: number;
    offerCount: number;
    coverage: number;
}
/** 型号最新指标（派生，1 行/型号） */
export interface PwStat {
    modelId: string;
    day: number;
    price: number;
    d1: number;
    r7: number;
    pos7: number;
    cv7: number;
    streak: number;
    label7: string;
    n30: number;
    r30: number;
    q30: number;
    m30: number;
    cv30: number;
    grade: string;
    modifier: string;
    confidence: string;
    updatedAt: Date;
}
/** 订阅关系 */
export interface PwSub {
    id: number;
    platform: string;
    channelId: string;
    userId: string;
    modelId: string;
    kind: string;
    threshold: number;
    createdAt: Date;
}
/** 推送目标（由主人用指令绑定） */
export interface PwTarget {
    id: number;
    platform: string;
    selfId: string;
    channelId: string;
    guildId: string;
    kind: string;
    mode: string;
    active: boolean;
    failCount: number;
    createdAt: Date;
}
/** 运行时元数据（跨重启幂等） */
export interface PwMeta {
    key: string;
    value: string;
    updatedAt: Date;
}
/**
 * 建表。字段设计要点：
 * - 价格存「分」整型，日期存 YYYYMMDD 整型 → 单行 ~105 B（见设计文档 §1.5.1）
 * - 唯一键保证「每 offer 每天 1 行」，重跑幂等
 * - 所有派生表（daily/stat）都可从 snapshot 重建
 *
 * ⚠️ minato 的 unique 语义（实测踩过）：字符串元素是**单列**唯一，复合唯一必须写嵌套数组。
 *    写成 `unique: ['offerId', 'day']` 会生成两个单列唯一约束（offerId 唯一 + day 唯一），
 *    后者意味着「全局每天只能有一行」，插入必然失败。正确写法是 `unique: [['offerId', 'day']]`。
 */
export declare function extend(ctx: Context): void;
