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
exports.discoverOffers = discoverOffers;
exports.describeDiscover = describeDiscover;
const search_1 = require("../crawler/search");
const itemId_1 = require("../util/itemId");
const repo = __importStar(require("../store/repo"));
const offers_1 = require("./offers");
const DEFAULT_PLATFORMS = ['taobao', 'jd', 'pdd'];
const PLATFORM_ZH = { jd: '京东', pdd: '拼多多', taobao: '淘宝' };
async function discoverOffers(ctx, config, options = {}) {
    const modelLimit = Math.max(1, options.modelLimit ?? 5);
    const minScore = options.minScore ?? 0.5;
    const platforms = options.platforms ?? DEFAULT_PLATFORMS;
    const models = await repo.listModels(ctx);
    const offers = await repo.listOffers(ctx);
    const bound = new Set(offers.filter((o) => (0, itemId_1.isValidItemId)(o.platform, o.itemId)).map((o) => `${o.modelId}:${o.platform}`));
    const result = {
        tried: 0,
        bound: 0,
        skipped: 0,
        byPlatform: {},
        notes: [],
    };
    for (const platform of platforms)
        result.byPlatform[platform] = { bound: 0, needsLogin: 0, noMatch: 0 };
    // 只挑还没绑定的型号，按库里的顺序取前 N 个
    const pending = [];
    for (const model of models) {
        if (pending.length >= modelLimit)
            break;
        const missing = platforms.some((platform) => !bound.has(`${model.id}:${platform}`));
        if (missing)
            pending.push(model);
    }
    for (const model of pending) {
        result.tried++;
        for (const platform of platforms) {
            if (bound.has(`${model.id}:${platform}`))
                continue;
            const stat = result.byPlatform[platform];
            const found = await (0, search_1.searchPlatform)(ctx, config, platform, model.name, 3).catch(() => null);
            if (!found) {
                stat.noMatch++;
                continue;
            }
            if (found.needsLogin) {
                stat.needsLogin++;
                const note = `${PLATFORM_ZH[platform] ?? platform} 搜索需要登录，已跳过`;
                if (!result.notes.includes(note))
                    result.notes.push(note);
                continue;
            }
            const best = found.hits.find((hit) => hit.score >= minScore && (0, itemId_1.isValidItemId)(platform, hit.itemId));
            if (!best) {
                stat.noMatch++;
                continue;
            }
            await (0, offers_1.bindOffer)(ctx, {
                model,
                platform,
                itemId: best.itemId,
                url: best.url.startsWith('http') ? best.url : '',
                shopName: '',
            });
            bound.add(`${model.id}:${platform}`);
            stat.bound++;
            result.bound++;
        }
        if (!platforms.some((p) => bound.has(`${model.id}:${p}`)))
            result.skipped++;
    }
    return result;
}
/** 给指令用的一行摘要 */
function describeDiscover(result) {
    if (!result.tried)
        return '所有型号都已经绑定链接，无需自动发现';
    const parts = Object.entries(result.byPlatform)
        .filter(([, stat]) => stat.bound > 0)
        .map(([platform, stat]) => `${PLATFORM_ZH[platform] ?? platform} ${stat.bound}`);
    const head = `自动发现：扫描 ${result.tried} 个型号，绑定 ${result.bound} 条报价${parts.length ? `（${parts.join(' / ')}）` : ''}`;
    return [head, ...result.notes.map((note) => `  · ${note}`)].join('\n');
}
//# sourceMappingURL=discover.js.map