"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAILY_WINDOW = void 0;
exports.rebuildDaily = rebuildDaily;
exports.rebuildStat = rebuildStat;
exports.rebuildAll = rebuildAll;
const constants_1 = require("../constants");
const analytics_1 = require("../analytics");
const repo = __importStar(require("./repo"));
/** 日聚合回看窗口：730 天足够覆盖 30 日指标 + 一年对比 */
exports.DAILY_WINDOW = 730;
/** 某型号当日的「代表价」：正常 offer 的中位数，≥3 个时用截尾均值 */
function pickPrices(snapshots) {
    return snapshots
        .filter((s) => s.status === constants_1.STATUS.OK && s.price > 0)
        .map((s) => s.price);
}
/**
 * 重建 pw_daily（型号 × 日）。派生数据，可随时重算。
 * 每天独立计算，因此支持从某天开始增量重建。
 */
async function rebuildDaily(ctx, options = {}) {
    const today = options.today ?? (0, constants_1.toDay)();
    const floor = options.sinceDay ?? (0, constants_1.shiftDay)(today, -(exports.DAILY_WINDOW - 1));
    const models = options.modelIds
        ? (await Promise.all(options.modelIds.map((id) => repo.getModel(ctx, id)))).filter(Boolean)
        : await repo.listModels(ctx);
    if (!models.length)
        return 0;
    const offers = await repo.listOffers(ctx);
    const activeByModel = new Map();
    for (const offer of offers) {
        if (!offer.active)
            continue;
        activeByModel.set(offer.modelId, (activeByModel.get(offer.modelId) ?? 0) + 1);
    }
    const snapshots = await repo.getSnapshots(ctx, models.map((m) => m.id), floor);
    // modelId -> day -> snapshots
    const grouped = new Map();
    for (const s of snapshots) {
        if (s.day < floor)
            continue;
        let byDay = grouped.get(s.modelId);
        if (!byDay)
            grouped.set(s.modelId, (byDay = new Map()));
        let list = byDay.get(s.day);
        if (!list)
            byDay.set(s.day, (list = []));
        list.push({ price: s.price, status: s.status });
    }
    let written = 0;
    let minDay = Number.MAX_SAFE_INTEGER;
    for (const model of models) {
        const byDay = grouped.get(model.id);
        if (!byDay)
            continue;
        const active = activeByModel.get(model.id) ?? 0;
        for (const [day, list] of byDay) {
            const prices = pickPrices(list);
            if (!prices.length)
                continue;
            const price = (0, analytics_1.representativePrice)(prices);
            await repo.upsertDaily(ctx, {
                modelId: model.id,
                day,
                low: Math.min(...prices),
                high: Math.max(...prices),
                median: price,
                offerCount: prices.length,
                coverage: active ? Math.min(1, prices.length / active) : 0,
            });
            written++;
            if (day < minDay)
                minDay = day;
        }
    }
    // 记录库里最早一天，供期号计算（只在变得更早时更新）
    if (minDay !== Number.MAX_SAFE_INTEGER) {
        const stored = Number(await repo.metaGet(ctx, 'firstDay')) || Number.MAX_SAFE_INTEGER;
        if (minDay < stored)
            await repo.metaSet(ctx, 'firstDay', String(minDay));
    }
    return written;
}
/**
 * 重建 pw_stat（每型号 1 行）。依赖 pw_daily。
 * 写时预计算：查询与推送都只读这一行，不再现算 30 日窗口。
 */
async function rebuildStat(ctx, options = {}) {
    const today = options.today ?? (0, constants_1.toDay)();
    const since = (0, constants_1.shiftDay)(today, -30);
    const models = options.modelIds?.length
        ? (await Promise.all(options.modelIds.map((id) => repo.getModel(ctx, id)))).filter(Boolean)
        : await repo.listModels(ctx);
    if (!models.length)
        return 0;
    const daily = await repo.getDaily(ctx, models.map((m) => m.id), since);
    const grouped = new Map();
    for (const row of daily) {
        if (!row.median)
            continue;
        const list = grouped.get(row.modelId) ?? [];
        list.push({ day: row.day, price: row.median });
        grouped.set(row.modelId, list);
    }
    let written = 0;
    for (const model of models) {
        const points = (grouped.get(model.id) ?? []).sort((a, b) => a.day - b.day);
        if (!points.length)
            continue;
        const short = (0, analytics_1.computeShort)(points);
        const long = (0, analytics_1.computeLong)(points);
        const last = points[points.length - 1];
        const prev = points.length > 1 ? points[points.length - 2] : null;
        const d1 = prev && prev.price ? last.price / prev.price - 1 : 0;
        await repo.upsertStat(ctx, {
            modelId: model.id,
            day: last.day,
            price: last.price,
            d1: Math.round(d1 * 1e4) / 1e4,
            r7: short.r7 ?? 0,
            pos7: short.pos7 ?? 0.5,
            cv7: short.cv7 ?? 0,
            streak: short.streak,
            label7: short.label,
            n30: long.n30,
            r30: long.r30,
            q30: long.q30,
            m30: long.m30,
            cv30: long.cv30,
            grade: long.grade,
            modifier: long.modifier,
            confidence: long.confidence,
        });
        written++;
    }
    return written;
}
async function rebuildAll(ctx, modelIds) {
    const daily = await rebuildDaily(ctx, { modelIds });
    const stat = await rebuildStat(ctx, { modelIds });
    return { daily, stat };
}
//# sourceMappingURL=aggregate.js.map