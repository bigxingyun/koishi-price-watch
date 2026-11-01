"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeQuery = normalizeQuery;
exports.countModels = countModels;
exports.listModels = listModels;
exports.getModel = getModel;
exports.searchModels = searchModels;
exports.upsertModel = upsertModel;
exports.removeModel = removeModel;
exports.countOffers = countOffers;
exports.listOffers = listOffers;
exports.upsertOffer = upsertOffer;
exports.upsertSnapshot = upsertSnapshot;
exports.getSnapshots = getSnapshots;
exports.getRecentSnapshots = getRecentSnapshots;
exports.getLastOkPrice = getLastOkPrice;
exports.upsertDaily = upsertDaily;
exports.getDaily = getDaily;
exports.upsertStat = upsertStat;
exports.getAllStats = getAllStats;
exports.getStat = getStat;
exports.listTargets = listTargets;
exports.addTarget = addTarget;
exports.removeTarget = removeTarget;
exports.markTargetFailed = markTargetFailed;
exports.seedTargets = seedTargets;
exports.addSub = addSub;
exports.removeSub = removeSub;
exports.listSubs = listSubs;
exports.resolveWatchIds = resolveWatchIds;
exports.metaGet = metaGet;
exports.metaSet = metaSet;
exports.metaDel = metaDel;
const constants_1 = require("../constants");
/** 查询归一化：小写 + 去空格 + 全角括号统一 */
function normalizeQuery(input) {
    return input
        .toLowerCase()
        .replace(/[×＊*]/g, 'x')
        .replace(/[（）]/g, (m) => (m === '（' ? '(' : ')'))
        .replace(/\s+/g, '');
}
// ── 型号 ──────────────────────────────────────
async function countModels(ctx) {
    const rows = await ctx.database.get('pw_model', {}, ['id']);
    return rows.length;
}
async function listModels(ctx, category) {
    const rows = (await ctx.database.get('pw_model', category ? { category } : {}));
    return rows.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
async function getModel(ctx, id) {
    const [row] = await ctx.database.get('pw_model', { id });
    return row;
}
/**
 * 模糊匹配型号。手写打分，不引第三方模糊匹配库：
 * 精确 id > 精确 name > 精确 alias > 互相包含 > alias 包含。
 */
async function searchModels(ctx, query, limit = 5) {
    const q = normalizeQuery(query);
    if (!q)
        return [];
    const all = (await ctx.database.get('pw_model', {}));
    const scored = [];
    for (const model of all) {
        const id = normalizeQuery(model.id);
        const name = normalizeQuery(model.name);
        const aliases = (model.aliases || []).map(normalizeQuery);
        let score = 0;
        if (id === q)
            score = 100;
        else if (name === q)
            score = 92;
        else if (aliases.includes(q))
            score = 88;
        else if (name.includes(q))
            score = 74;
        else if (q.includes(name))
            score = 68;
        else if (aliases.some((a) => a.includes(q) || q.includes(a)))
            score = 60;
        else if (id.includes(q))
            score = 50;
        if (score > 0)
            scored.push({ model, score: score + model.priority * 0.1 });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}
async function upsertModel(ctx, row) {
    const data = { ...row, createdAt: row.createdAt ?? new Date() };
    const res = await ctx.database.set('pw_model', { id: row.id }, data);
    if (res.matched)
        return false;
    await ctx.database.create('pw_model', data);
    return true;
}
async function removeModel(ctx, id) {
    const res = await ctx.database.remove('pw_model', { id });
    return !!res.matched;
}
// ── 报价 ──────────────────────────────────────
async function countOffers(ctx) {
    const rows = await ctx.database.get('pw_offer', {}, ['id']);
    return rows.length;
}
async function listOffers(ctx, modelId) {
    return ctx.database.get('pw_offer', modelId ? { modelId } : {});
}
/** 唯一键是 (platform, itemId)，所以先按唯一键 set，未命中再 create —— 幂等重跑 */
async function upsertOffer(ctx, row) {
    const createdAt = row.createdAt ?? new Date();
    const res = await ctx.database.set('pw_offer', { platform: row.platform, itemId: row.itemId }, { ...row, createdAt });
    if (res.matched)
        return false;
    await ctx.database.create('pw_offer', { ...row, createdAt });
    return true;
}
// ── 日快照 ────────────────────────────────────
/** 唯一键是 (offerId, day)：同一天重跑只覆盖，不新增行 */
async function upsertSnapshot(ctx, row) {
    const ts = row.ts ?? new Date();
    const res = await ctx.database.set('pw_snapshot', { offerId: row.offerId, day: row.day }, {
        modelId: row.modelId,
        price: row.price,
        listPrice: row.listPrice,
        status: row.status,
        samples: row.samples,
        ts,
    });
    if (res.matched) {
        await ctx.database.set('pw_snapshot', { offerId: row.offerId, day: row.day }, { ts });
        return false;
    }
    await ctx.database.create('pw_snapshot', { ...row, ts });
    return true;
}
async function getSnapshots(ctx, modelIds, sinceDay) {
    if (!modelIds.length)
        return [];
    return ctx.database.get('pw_snapshot', {
        modelId: { $in: modelIds },
        day: { $gte: sinceDay },
    });
}
/** 按 offer 取最近 N 天成功快照（用于算「到手价」与平台报价对照） */
async function getRecentSnapshots(ctx, sinceDay) {
    return ctx.database.get('pw_snapshot', {
        day: { $gte: sinceDay },
        status: constants_1.STATUS.OK,
    });
}
/** 该 offer 在 beforeDay 之前最近一次成功价（用于异常值判定） */
async function getLastOkPrice(ctx, offerId, beforeDay) {
    const rows = (await ctx.database.get('pw_snapshot', {
        offerId,
        day: { $lt: beforeDay },
        status: constants_1.STATUS.OK,
    }));
    if (!rows.length)
        return undefined;
    rows.sort((a, b) => b.day - a.day);
    return rows[0].price || undefined;
}
// ── 日聚合 ────────────────────────────────────
async function upsertDaily(ctx, row) {
    const res = await ctx.database.set('pw_daily', { modelId: row.modelId, day: row.day }, {
        low: row.low,
        high: row.high,
        median: row.median,
        offerCount: row.offerCount,
        coverage: row.coverage,
    });
    if (!res.matched)
        await ctx.database.create('pw_daily', row);
}
async function getDaily(ctx, modelIds, sinceDay) {
    // 空数组 = 不过滤型号（告警要全量看三十日最低价）
    const query = { day: { $gte: sinceDay } };
    if (modelIds.length)
        query.modelId = { $in: modelIds };
    return ctx.database.get('pw_daily', query);
}
// ── 指标 ──────────────────────────────────────
async function upsertStat(ctx, row) {
    await ctx.database.upsert('pw_stat', [{ ...row, updatedAt: new Date() }]);
}
async function getAllStats(ctx) {
    return ctx.database.get('pw_stat', {});
}
async function getStat(ctx, modelId) {
    const [row] = await ctx.database.get('pw_stat', { modelId });
    return row;
}
// ── 推送目标 ──────────────────────────────────
async function listTargets(ctx, kind) {
    const rows = (await ctx.database.get('pw_target', {}));
    return rows.filter((t) => t.active && (!kind || t.kind === kind));
}
/** 唯一键是 (platform, selfId, channelId, kind) */
async function addTarget(ctx, input) {
    const payload = {
        platform: input.platform,
        selfId: input.selfId || '',
        channelId: input.channelId,
        guildId: input.guildId || '',
        kind: input.kind,
        mode: input.mode,
        active: true,
        failCount: 0,
        createdAt: new Date(),
    };
    const res = await ctx.database.set('pw_target', { platform: payload.platform, selfId: payload.selfId, channelId: payload.channelId, kind: payload.kind }, { mode: payload.mode, active: true, failCount: 0 });
    if (res.matched)
        return false;
    await ctx.database.create('pw_target', payload);
    return true;
}
async function removeTarget(ctx, id) {
    const res = await ctx.database.remove('pw_target', { id });
    return !!res.matched;
}
async function markTargetFailed(ctx, id, failCount) {
    await ctx.database.set('pw_target', { id }, { failCount, active: failCount < 3 });
}
/** 首次启动时把配置里的 targets 作为种子导入（表里已有数据则完全不动） */
async function seedTargets(ctx, seeds) {
    if (!seeds?.length)
        return 0;
    const existing = await ctx.database.get('pw_target', {}, ['id']);
    if (existing.length)
        return 0;
    let added = 0;
    for (const seed of seeds) {
        if (await addTarget(ctx, seed))
            added++;
    }
    return added;
}
/** 唯一键是 (platform, channelId, userId, modelId, kind) */
async function addSub(ctx, input) {
    const res = await ctx.database.set('pw_sub', {
        platform: input.platform,
        channelId: input.channelId,
        userId: input.userId,
        modelId: input.modelId,
        kind: input.kind,
    }, { threshold: input.threshold });
    if (res.matched)
        return false;
    await ctx.database.create('pw_sub', { ...input, createdAt: new Date() });
    return true;
}
async function removeSub(ctx, platform, channelId, modelId) {
    const res = await ctx.database.remove('pw_sub', { platform, channelId, modelId });
    return !!res.matched;
}
async function listSubs(ctx, platform, channelId) {
    const query = {};
    if (platform)
        query.platform = platform;
    if (channelId)
        query.channelId = channelId;
    return ctx.database.get('pw_sub', query);
}
/**
 * 某个会话订阅的型号 id 列表（含 `gpu:*` 这种整组订阅的展开）。
 * 日报的「我的关注」用它。
 */
async function resolveWatchIds(ctx, platform, channelId, limit = 5) {
    const subs = await listSubs(ctx, platform, channelId);
    if (!subs.length)
        return [];
    const models = await listModels(ctx);
    const ids = [];
    for (const sub of subs) {
        if (sub.modelId.endsWith(':*')) {
            const category = sub.modelId.slice(0, -2);
            for (const model of models) {
                if (model.category === category && !ids.includes(model.id))
                    ids.push(model.id);
            }
        }
        else if (!ids.includes(sub.modelId)) {
            ids.push(sub.modelId);
        }
    }
    return ids.slice(0, limit);
}
// ── 元数据 ────────────────────────────────────
async function metaGet(ctx, key) {
    const [row] = await ctx.database.get('pw_meta', { key });
    return row?.value;
}
async function metaSet(ctx, key, value) {
    await ctx.database.upsert('pw_meta', [{ key, value, updatedAt: new Date() }]);
}
async function metaDel(ctx, key) {
    await ctx.database.remove('pw_meta', { key });
}
//# sourceMappingURL=repo.js.map