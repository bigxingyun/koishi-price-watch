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
exports.seedDemo = seedDemo;
const constants_1 = require("../constants");
const repo = __importStar(require("../store/repo"));
/**
 * 演示数据生成器（仅调试用）。
 *
 * 用途：在真实采集接入之前，验证「聚合 → 指标 → 渲染」全链路。
 *
 * 生成逻辑的两条约束（第一版踩过坑）：
 * 1. 同一型号的所有平台共享**同一条价格曲线**，只叠加固定的平台偏移（±2.5%），
 *    否则三个平台各自随机游走，40 天后价差会漂到 30%，比价段完全失真
 * 2. 用确定性 PRNG（seed = 型号 id），同一份数据每次跑出来一模一样，方便对比截图
 */
const BASE_RANGE = {
    gpu: [2800, 22000],
    ram: [260, 1500],
    ssd: [330, 1500],
};
/**
 * 演示用的锚定价（元）。只是为了「截出来的报表看起来像真的」，
 * 不代表真实行情，也不参与任何计算逻辑。
 */
const ANCHOR_YUAN = {
    'gpu:rtx5090-32g': 17999,
    'gpu:rtx5080-16g': 9499,
    'gpu:rtx5070ti-16g': 6299,
    'gpu:rtx5070-12g': 4499,
    'gpu:rtx5060ti-16g': 3399,
    'gpu:rtx5060-8g': 2499,
    'gpu:rtx4060-8g': 2099,
    'gpu:rx9070xt-16g': 4299,
    'gpu:rx9070-16g': 3799,
    'gpu:rx9060xt-16g': 2499,
    'gpu:arc-b580-12g': 1799,
    'gpu:rtx3060-12g': 1699,
    'ram:ddr5-6000-16gx2': 649,
    'ram:ddr5-6000-32gx2': 1099,
    'ram:ddr5-6400-16gx2': 699,
    'ram:ddr5-5600-16gx2': 589,
    'ram:ddr5-5600-32g-sodimm': 549,
    'ram:ddr5-4800-16gx2-sodimm': 479,
    'ram:ddr4-3200-16gx2': 269,
    'ram:ddr4-3600-8gx2': 189,
    'ssd:990pro-2t': 1099,
    'ssd:990pro-1t': 649,
    'ssd:9100pro-2t': 1499,
    'ssd:sn850x-2t': 899,
    'ssd:sn850x-1t': 499,
    'ssd:tiplus7100-2t': 679,
    'ssd:tipro7000-2t': 759,
    'ssd:kc3000-1t': 429,
};
/** 各品类的基础日漂移：让「显卡跌、内存涨、SSD 平」的故事真的成立 */
const SHOP_NAMES = ['品牌旗舰店', 'XX数码专营店', '自营官方旗舰店', '电脑配件工厂店', '雷霆装机店'];
const DRIFT = {
    gpu: -0.0012,
    ram: 0.0022,
    ssd: 0.0002,
};
function hashString(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
/** 确定性 PRNG */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
async function seedDemo(ctx, options = {}) {
    const days = options.days ?? 40;
    const today = (0, constants_1.toDay)();
    const models = (await repo.listModels(ctx)).slice(0, options.limit ?? 99);
    let offerCount = 0;
    let snapshotCount = 0;
    for (const [i, model] of models.entries()) {
        const rnd = mulberry32(hashString(model.id));
        const category = model.category;
        const [lo, hi] = BASE_RANGE[category] ?? BASE_RANGE.ssd;
        const anchored = ANCHOR_YUAN[model.id];
        const anchorYuan = anchored ?? lo + (hi - lo) * Math.min(1, ((i % 7) + rnd()) / 7);
        // 型号级价格曲线（所有平台共用）
        const path = [];
        let factor = 1;
        // 品类趋势 + 型号个体偏差：同一个品类里有的涨有的跌，才像真实行情
        const individual = (rnd() > 0.65 ? 1 : -1) * 0.0018;
        const drift = DRIFT[category] * (0.7 + rnd() * 0.6) + individual;
        for (let k = 0; k < days; k++) {
            const noise = (rnd() - 0.5) * 0.009;
            const promo = rnd() > 0.975 ? -0.05 : 0;
            factor *= 1 + drift + noise + promo;
            path.push(factor);
        }
        // 演示数据一律使用 mock 平台：绝不伪装成 jd/taobao/pdd，
        // 否则型号榜里的价格看着是真的、却根本采集不到（这是之前的状态）。
        const platforms = ['mock'];
        for (const platform of platforms) {
            await repo.upsertOffer(ctx, {
                modelId: model.id,
                platform,
                shopId: '',
                shopName: SHOP_NAMES[(model.id.length + platform.length + model.name.length) % SHOP_NAMES.length],
                itemId: `${platform}-${model.id}`,
                url: `https://example.com/${platform}/${model.id}`,
                title: model.name,
                active: true,
            });
            offerCount++;
        }
        const offers = await repo.listOffers(ctx, model.id);
        for (const offer of offers) {
            const offerRnd = mulberry32(hashString(offer.itemId));
            // 平台固定偏移：拼多多略低、淘宝略高，价差稳定在 1~5%
            const offset = 0.975 + offerRnd() * 0.05;
            const baseCents = (0, constants_1.toCents)(anchorYuan) * offset;
            for (let k = 0; k < days; k++) {
                const day = (0, constants_1.shiftDay)(today, -(days - 1 - k));
                const price = Math.max((0, constants_1.toCents)(10), baseCents * path[k]);
                const outOfStock = offerRnd() > 0.988;
                await repo.upsertSnapshot(ctx, {
                    offerId: offer.id,
                    modelId: model.id,
                    day,
                    price: Math.round(price),
                    listPrice: Math.round(price * 1.15),
                    status: outOfStock ? constants_1.STATUS.OUT_OF_STOCK : constants_1.STATUS.OK,
                    samples: 1,
                });
                snapshotCount++;
            }
        }
    }
    return { offers: offerCount, snapshots: snapshotCount };
}
//# sourceMappingURL=demo.js.map