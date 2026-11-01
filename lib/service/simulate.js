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
exports.discoverBySimulation = discoverBySimulation;
exports.describeSimulate = describeSimulate;
const browser_1 = require("../crawler/browser");
const human_1 = require("../crawler/human");
const itemId_1 = require("../util/itemId");
const repo = __importStar(require("../store/repo"));
const quote_1 = require("../domain/quote");
const offers_1 = require("./offers");
const SEARCH_URL = {
    taobao: (kw) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(kw)}`,
};
const ITEM_ID_RE = {
    pdd: /goods_id=(\d{6,})/,
    taobao: /[?&]id=(\d{6,})/,
    jd: /\/(\d{6,})\.html/,
};
const PLATFORM_ZH = { pdd: '拼多多', taobao: '淘宝', jd: '京东' };
/** 从落地页读标题、价格、店铺，并提取商品 id */
async function readLanded(page) {
    const raw = await page.evaluate(`(() => {
    const clean = (s) => (s || '').replace(/[\\u200b-\\u200d]/g, '').replace(/\\s+/g, ' ').trim()
    const text = clean(document.body ? document.body.innerText : '')
    const m = text.match(/大促价\\s*[¥￥]\\s*([0-9]+(?:\\.[0-9]+)?)/)
      || text.match(/券后\\s*[¥￥]\\s*([0-9]+(?:\\.[0-9]+)?)/)
      || text.match(/[¥￥]\\s*([0-9]{2,6}(?:\\.[0-9]+)?)/)
    const shop = (document.querySelector('[class*="shop" i]')?.textContent || '').trim().slice(0, 30)
    return { href: location.href, title: document.title, price: m ? m[1] : '', shop, body: text.slice(0, 300) }
  })()`);
    return {
        href: raw?.href ?? '',
        title: (raw?.title ?? '').trim(),
        price: Number(raw?.price ?? 0) || 0,
        shop: raw?.shop ?? '',
        body: raw?.body ?? '',
    };
}
async function discoverBySimulation(ctx, config, options = {}) {
    const platforms = options.platforms?.length ? options.platforms : ['taobao'];
    const modelLimit = Math.max(1, options.modelLimit ?? 3);
    const result = { tried: 0, bound: 0, priced: 0, byPlatform: {}, notes: [] };
    for (const platform of platforms)
        result.byPlatform[platform] = { bound: 0, priced: 0, failed: 0 };
    const models = await repo.listModels(ctx);
    const offers = await repo.listOffers(ctx);
    const bound = new Set(offers.filter((o) => (0, itemId_1.isValidItemId)(o.platform, o.itemId)).map((o) => `${o.modelId}:${o.platform}`));
    const pending = models.filter((model) => platforms.some((p) => !bound.has(`${model.id}:${p}`))).slice(0, modelLimit);
    if (!pending.length) {
        result.notes.push('所有型号都已绑定，无需仿真发现');
        return result;
    }
    for (const model of pending) {
        result.tried++;
        for (const platform of platforms) {
            if (bound.has(`${model.id}:${platform}`))
                continue;
            const stat = result.byPlatform[platform];
            const urlOf = SEARCH_URL[platform];
            if (!urlOf) {
                stat.failed++;
                continue;
            }
            const session = await (0, browser_1.acquireProfile)(ctx, config, platform).catch(() => null);
            if (!session) {
                stat.failed++;
                continue;
            }
            const page = await session.newPage({
                viewport: { width: 1280, height: 900 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
            });
            try {
                if (!page.goto) {
                    stat.failed++;
                    continue;
                }
                if (platform === 'jd') {
                    // 京东直接访问搜索 URL 会触发「抱歉」风控页，改走首页搜索框
                    await page.goto('https://www.jd.com/', { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
                    await new Promise((resolve) => setTimeout(resolve, 2500));
                    await (0, human_1.humanSearch)(page, model.name, {}).catch(() => false);
                }
                else {
                    await page.goto(urlOf(model.name), { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
                }
                // 列表是懒加载：等内容 + 滚一屏
                for (let i = 0; i < 8; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    const len = await page.evaluate(`((document.body ? document.body.innerText : '').replace(/[\\u200b-\\u200d]/g, '').length)`).catch(() => 0);
                    if ((len ?? 0) > 300)
                        break;
                }
                await (0, human_1.humanScroll)(page, { scrolls: 2 });
                const clicked = await (0, human_1.clickProductByKeyword)(page, model.name).catch(() => false);
                if (!clicked) {
                    stat.failed++;
                    const note = `${PLATFORM_ZH[platform] ?? platform} 搜索页没有可点开的商品卡`;
                    if (!result.notes.includes(note))
                        result.notes.push(note);
                    continue;
                }
                const landed = await readLanded(page);
                const itemId = landed.href.match(ITEM_ID_RE[platform] ?? /(\d{6,})/)?.[1];
                if (!itemId || !(0, itemId_1.isValidItemId)(platform, itemId)) {
                    stat.failed++;
                    const note = `${PLATFORM_ZH[platform] ?? platform} 落地页没有商品 ID（${landed.href.slice(0, 50)}）`;
                    if (!result.notes.includes(note))
                        result.notes.push(note);
                    continue;
                }
                // 落地页标题/正文必须含目标型号，否则就是点错了卡片（配件、引流款）
                const matched = (0, quote_1.modelMatches)(model.name, landed.title + ' ' + landed.body);
                if (!matched.matches) {
                    stat.failed++;
                    const note = `${PLATFORM_ZH[platform] ?? platform} 点到的不是目标型号（${landed.title.slice(0, 20)}），已跳过`;
                    if (!result.notes.includes(note))
                        result.notes.push(note);
                    continue;
                }
                await (0, offers_1.bindOffer)(ctx, { model, platform, itemId, url: landed.href.split('?')[0], shopName: landed.shop });
                bound.add(`${model.id}:${platform}`);
                stat.bound++;
                result.bound++;
                if (landed.price) {
                    stat.priced++;
                    result.priced++;
                }
            }
            catch (error) {
                stat.failed++;
                const note = `${PLATFORM_ZH[platform] ?? platform} 仿真发现失败：${error.message.slice(0, 40)}`;
                if (!result.notes.includes(note))
                    result.notes.push(note);
            }
            finally {
                await page.close().catch(() => undefined);
            }
        }
    }
    return result;
}
function describeSimulate(result) {
    if (!result.tried)
        return result.notes[0] ?? '无需仿真发现';
    const parts = Object.entries(result.byPlatform)
        .filter(([, stat]) => stat.bound > 0)
        .map(([platform, stat]) => `${PLATFORM_ZH[platform] ?? platform} ${stat.bound}`);
    return [
        `仿真发现：扫 ${result.tried} 个型号，自动绑定 ${result.bound} 条${parts.length ? `（${parts.join(' / ')}）` : ''}`,
        ...result.notes.map((note) => `  · ${note}`),
    ].join('\n');
}
//# sourceMappingURL=simulate.js.map