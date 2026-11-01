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
exports.priceLooksSane = void 0;
exports.qualitySummary = qualitySummary;
exports.qualityLine = qualityLine;
const constants_1 = require("../constants");
const repo = __importStar(require("../store/repo"));
const quote_1 = require("../domain/quote");
Object.defineProperty(exports, "priceLooksSane", { enumerable: true, get: function () { return quote_1.priceLooksSane; } });
/** 状态 → 人话（快照表没有 note 字段，只能按状态码解释） */
const STATUS_TEXT = {
    [constants_1.STATUS.OK]: '正常',
    [constants_1.STATUS.OUT_OF_STOCK]: '缺货',
    [constants_1.STATUS.DELISTED]: '已下架',
    [constants_1.STATUS.SUSPICIOUS]: '价格可疑被拦下',
    [constants_1.STATUS.FAILED]: '抓取失败',
};
async function qualitySummary(ctx, day = (0, constants_1.toDay)()) {
    const offers = await repo.listOffers(ctx);
    const offerPlatform = new Map(offers.map((o) => [o.id, o.platform]));
    const models = await repo.listModels(ctx);
    const snapshots = models.length ? await repo.getSnapshots(ctx, models.map((m) => m.id), day) : [];
    // 跨天查询：getSnapshots 只给当天的，足够做「今日质量」
    const summary = {
        day,
        total: snapshots.length,
        ok: 0,
        failed: 0,
        outOfStock: 0,
        delisted: 0,
        suspicious: 0,
        lastFailures: [],
    };
    const lastByPlatform = new Map();
    for (const snap of snapshots) {
        switch (snap.status) {
            case constants_1.STATUS.OK:
                summary.ok++;
                break;
            case constants_1.STATUS.OUT_OF_STOCK:
                summary.outOfStock++;
                break;
            case constants_1.STATUS.DELISTED:
                summary.delisted++;
                break;
            case constants_1.STATUS.SUSPICIOUS:
                summary.suspicious++;
                summary.failed++;
                break;
            default:
                summary.failed++;
                break;
        }
        if (snap.status !== constants_1.STATUS.OK) {
            const platform = offerPlatform.get(snap.offerId) ?? 'unknown';
            lastByPlatform.set(platform, {
                reason: STATUS_TEXT[snap.status] ?? String(snap.status),
                offerId: snap.offerId,
            });
        }
    }
    summary.lastFailures = [...lastByPlatform.entries()].map(([platform, v]) => ({ platform, ...v }));
    return summary;
}
/** 给日报脚注用的一行 */
function qualityLine(summary) {
    const parts = [`成功 ${summary.ok}`];
    if (summary.failed)
        parts.push(`失败 ${summary.failed}`);
    if (summary.suspicious)
        parts.push(`可疑 ${summary.suspicious}`);
    if (summary.outOfStock)
        parts.push(`缺货 ${summary.outOfStock}`);
    if (summary.delisted)
        parts.push(`下架 ${summary.delisted}`);
    return `数据质量：${parts.join(' · ')}（共 ${summary.total} 条）`;
}
//# sourceMappingURL=quality.js.map