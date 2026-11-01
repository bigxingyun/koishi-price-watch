"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extend = extend;
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
function extend(ctx) {
    ctx.model.extend('pw_model', {
        id: 'string',
        category: 'string',
        brand: 'string',
        name: 'string',
        spec: 'json',
        aliases: 'list',
        inIndex: 'boolean',
        priority: 'integer',
        createdAt: 'timestamp',
    }, { primary: 'id' });
    ctx.model.extend('pw_offer', {
        id: 'unsigned',
        modelId: 'string',
        platform: 'string',
        shopId: 'string',
        shopName: 'string',
        itemId: 'string',
        url: 'text',
        title: 'string',
        active: 'boolean',
        createdAt: 'timestamp',
    }, { autoInc: true, unique: [['platform', 'itemId']] });
    ctx.model.extend('pw_snapshot', {
        id: 'unsigned',
        offerId: 'unsigned',
        modelId: 'string',
        day: 'unsigned',
        price: 'unsigned',
        listPrice: 'unsigned',
        status: 'unsigned',
        samples: 'unsigned',
        ts: 'timestamp',
    }, { autoInc: true, unique: [['offerId', 'day']] });
    ctx.model.extend('pw_daily', {
        id: 'unsigned',
        modelId: 'string',
        day: 'unsigned',
        low: 'unsigned',
        high: 'unsigned',
        median: 'unsigned',
        offerCount: 'unsigned',
        coverage: 'float',
    }, { autoInc: true, unique: [['modelId', 'day']] });
    ctx.model.extend('pw_stat', {
        modelId: 'string',
        day: 'unsigned',
        price: 'unsigned',
        d1: 'float',
        r7: 'float',
        pos7: 'float',
        cv7: 'float',
        streak: 'integer',
        label7: 'string',
        n30: 'unsigned',
        r30: 'float',
        q30: 'float',
        m30: 'float',
        cv30: 'float',
        grade: 'string',
        modifier: 'string',
        confidence: 'string',
        updatedAt: 'timestamp',
    }, { primary: 'modelId' });
    ctx.model.extend('pw_sub', {
        id: 'unsigned',
        platform: 'string',
        channelId: 'string',
        userId: 'string',
        modelId: 'string',
        kind: 'string',
        threshold: 'float',
        createdAt: 'timestamp',
    }, { autoInc: true, unique: [['platform', 'channelId', 'userId', 'modelId', 'kind']] });
    ctx.model.extend('pw_target', {
        id: 'unsigned',
        platform: 'string',
        selfId: 'string',
        channelId: 'string',
        guildId: 'string',
        kind: 'string',
        mode: 'string',
        active: 'boolean',
        failCount: 'unsigned',
        createdAt: 'timestamp',
    }, { autoInc: true, unique: [['platform', 'selfId', 'channelId', 'kind']] });
    ctx.model.extend('pw_meta', {
        key: 'string',
        value: 'text',
        updatedAt: 'timestamp',
    }, { primary: 'key' });
}
//# sourceMappingURL=model.js.map