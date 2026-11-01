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
exports.ingestQuotes = ingestQuotes;
exports.describeIngest = describeIngest;
const constants_1 = require("../constants");
const quote_1 = require("../domain/quote");
const aggregate_1 = require("../store/aggregate");
const repo = __importStar(require("../store/repo"));
const PLATFORMS = new Set(['jd', 'pdd', 'taobao', 'manual']);
function guessCategory(model) {
    const name = model.toLowerCase();
    if (/ddr|内存|ram/.test(name))
        return 'ram';
    if (/ssd|nvme|固态|tb|990|850x|p44|sn\d/.test(name))
        return 'ssd';
    return 'gpu';
}
async function ingestQuotes(ctx, config, payload) {
    const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
    const rejected = [];
    let accepted = 0;
    const touched = new Set();
    const source = (payload.source || '外部接入').slice(0, 24);
    for (let index = 0; index < quotes.length; index++) {
        const quote = quotes[index];
        try {
            const platform = String(quote.platform || '').toLowerCase();
            if (!PLATFORMS.has(platform)) {
                rejected.push({ index, reason: `不认识的平台「${quote.platform}」` });
                continue;
            }
            const modelName = String(quote.model || '').trim();
            if (modelName.length < 2) {
                rejected.push({ index, reason: '型号名为空' });
                continue;
            }
            const price = Number(quote.price);
            if (!Number.isFinite(price) || !(0, quote_1.priceLooksSane)(price)) {
                rejected.push({ index, reason: `价格不合理（${quote.price}）` });
                continue;
            }
            const day = Number(quote.day) || (0, constants_1.toDay)();
            // 找型号；没有就建一个（外部数据常常带新型号）
            const matches = await repo.searchModels(ctx, modelName, 1);
            let model = matches[0]?.model;
            if (!model) {
                const id = `${guessCategory(modelName)}-${Buffer.from(modelName).toString('hex').slice(0, 12)}`;
                await repo.upsertModel(ctx, {
                    id,
                    name: modelName,
                    category: guessCategory(modelName),
                    brand: '',
                    spec: '',
                    aliases: [],
                });
                model = await repo.getModel(ctx, id);
            }
            if (!model) {
                rejected.push({ index, reason: '型号创建失败' });
                continue;
            }
            // 偏离历史中位数 → 标可疑，不入正常价
            const history = await repo.getRecentSnapshots(ctx, day - 30);
            const modelId = model.id;
            const past = history.filter((s) => s.modelId === modelId && s.status === constants_1.STATUS.OK).map((s) => s.price / 100);
            const outlier = (0, quote_1.priceOutlier)(past, price);
            if (outlier.outlier) {
                rejected.push({ index, reason: outlier.reason ?? '价格偏离历史中位数' });
                continue;
            }
            // 绑到报价（同一型号+平台，一个就够）
            let offers = await repo.listOffers(ctx, modelId);
            let offer = offers.find((o) => o.platform === platform);
            if (!offer) {
                await repo.upsertOffer(ctx, {
                    modelId: model.id,
                    platform,
                    shopId: '',
                    shopName: String(quote.shopName || '').slice(0, 40),
                    itemId: String(quote.itemId || `${platform}-${Date.now()}`),
                    url: String(quote.url || ''),
                    title: String(quote.title || model.name).slice(0, 120),
                    active: true,
                });
                offers = await repo.listOffers(ctx, modelId);
                offer = offers.find((o) => o.platform === platform);
            }
            if (!offer) {
                rejected.push({ index, reason: '报价创建失败' });
                continue;
            }
            await repo.upsertSnapshot(ctx, {
                offerId: offer.id,
                modelId,
                day,
                price: (0, constants_1.toCents)(price),
                listPrice: (0, constants_1.toCents)(Number(quote.listPrice) || price),
                status: constants_1.STATUS.OK,
                samples: 1,
            });
            await repo.metaSet(ctx, `ingest:${platform}`, JSON.stringify({ at: Date.now(), source })).catch(() => undefined);
            touched.add(modelId);
            accepted++;
        }
        catch (error) {
            rejected.push({ index, reason: error.message.slice(0, 60) });
        }
    }
    if (touched.size)
        await (0, aggregate_1.rebuildAll)(ctx, [...touched]);
    return { accepted, rejected, day: (0, constants_1.toDay)() };
}
/** 返回给调用方的摘要文本（HTTP 与指令共用） */
function describeIngest(result, source) {
    const lines = [`导入完成：接受 ${result.accepted} 条${source ? `（来源 ${source}）` : ''}`];
    if (result.rejected.length) {
        lines.push('被拒：');
        for (const item of result.rejected.slice(0, 5))
            lines.push(`  · 第 ${item.index + 1} 条：${item.reason}`);
        if (result.rejected.length > 5)
            lines.push(`  · 其余 ${result.rejected.length - 5} 条同类原因`);
    }
    lines.push('', '数据已写入并能出报表：价格 日报');
    return lines.join('\n');
}
//# sourceMappingURL=ingest.js.map