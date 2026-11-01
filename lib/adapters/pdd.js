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
exports.pddAdapter = void 0;
exports.extractGoodsId = extractGoodsId;
exports.parsePddHtml = parsePddHtml;
const constants_1 = require("../constants");
const normalize_1 = require("../crawler/normalize");
const quote_1 = require("../domain/quote");
const price_text_1 = require("../crawler/price-text");
const sku_1 = require("../crawler/sku");
const types_1 = require("../crawler/types");
/**
 * 拼多多适配器。
 *
 * 已知结构（H5 商品页 `mobile.yangkeduo.com/goods.html?goods_id=`）：
 * - 页面内联 `window.rawData`，含 `minGroupPrice` / `minNormalPrice`（单位：分）
 * - 严格接口 `mobile.yangkeduo.com/proxy/api/*` 需要 `anti_content`，逆向成本高，不采用
 *
 * 与京东一致的策略：HTTP 取证 → 拿不到就用浏览器渲染 → 都不行就如实失败。
 */
const GOODS_URL = (goodsId) => `https://mobile.yangkeduo.com/goods.html?goods_id=${goodsId}`;
function extractGoodsId(job) {
    const fromItem = job.offer.itemId.match(/(\d{6,})/);
    if (fromItem)
        return fromItem[1];
    const fromUrl = job.offer.url.match(/goods_id=(\d+)/);
    return fromUrl ? fromUrl[1] : null;
}
/** 从 HTML 里抽 `window.rawData` 并取价格（分） */
function parsePddHtml(html) {
    const match = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
        ?? html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*;?\s*window/);
    if (!match)
        return null;
    let data;
    try {
        data = JSON.parse(match[1]);
    }
    catch {
        return null;
    }
    // 结构随版本变化，所以按字段名递归找，而不是写死路径
    const found = {};
    const walk = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 12)
            return;
        for (const [key, value] of Object.entries(node)) {
            if (key === 'minGroupPrice' || key === 'minNormalPrice' || key === 'groupPrice' || key === 'normalPrice') {
                if (typeof value === 'number' && value > 0)
                    found[key] = value;
                else if (typeof value === 'string') {
                    const parsed = (0, normalize_1.parsePrice)(value);
                    if (parsed)
                        found[key] = parsed;
                }
            }
            walk(value, depth + 1);
        }
    };
    walk(data);
    const price = found.minGroupPrice ?? found.groupPrice ?? found.minNormalPrice ?? found.normalPrice;
    if (!price)
        return null;
    const listPrice = found.minNormalPrice ?? found.normalPrice;
    return { price, listPrice };
}
exports.pddAdapter = {
    platform: 'pdd',
    needsBrowser: true,
    async fetch(job) {
        const goodsId = extractGoodsId(job);
        if (!goodsId)
            throw new types_1.ParseError(`无法从 ${job.offer.itemId} 解析出拼多多 goods_id`, job.offer.itemId);
        const { fetchText } = await Promise.resolve().then(() => __importStar(require('../crawler/fetcher')));
        const { MOBILE_UA } = await Promise.resolve().then(() => __importStar(require('../crawler/fetcher')));
        let httpError;
        try {
            const { body } = await fetchText(job.ctx, GOODS_URL(goodsId), {
                ua: MOBILE_UA,
                timeout: job.config.collect.timeoutMs,
                retries: 0,
                headers: { Referer: 'https://mobile.yangkeduo.com/' },
            });
            if (/请完成验证|安全验证/.test(body.slice(0, 4000)))
                throw new types_1.AuthError('拼多多要求验证', 'pdd');
            const parsed = parsePddHtml(body);
            if (parsed) {
                return { price: parsed.price, listPrice: parsed.listPrice, status: constants_1.STATUS.OK, note: 'http' };
            }
            throw new types_1.ParseError('拼多多页面未找到 window.rawData 价格字段');
        }
        catch (error) {
            if (error instanceof types_1.AuthError)
                throw error;
            httpError = error;
        }
        if (!job.config.collect.browserEnabled) {
            throw new types_1.ParseError(`${httpError?.message ?? 'HTTP 探测失败'}（可在配置里开启 browser.enabled 用浏览器渲染）`);
        }
        // 浏览器兜底：渲染后从 DOM 取价格文本
        const { acquireProfile } = await Promise.resolve().then(() => __importStar(require('../crawler/browser')));
        const { browseToProduct, humanDelay } = await Promise.resolve().then(() => __importStar(require('../crawler/human')));
        const browser = await acquireProfile(job.ctx, job.config, 'pdd');
        let page;
        try {
            page = await browser.newPage({
                viewport: { width: 414, height: 896 }, userAgent: MOBILE_UA, isMobile: true, hasTouch: true,
            });
            if (!page.goto)
                throw new types_1.ParseError('浏览器实现不支持 goto');
            // 先走真人路径（首页 → 搜索 → 点商品卡），直连容易被风控
            const walked = await browseToProduct(page, {
                home: 'https://mobile.yangkeduo.com/',
                search: (keyword) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(keyword)}`,
            }, goodsId, job.model.name);
            if (!walked) {
                await page.goto(GOODS_URL(goodsId), { waitUntil: 'domcontentloaded', timeout: job.config.collect.timeoutMs });
            }
            await humanDelay({ delay: [1200, 2600] });
            await page.waitForSelector?.('[class*="price"]', { timeout: 8000 }).catch(() => undefined);
            // 优先读页面内 window.rawData（开源实现里最稳的入口，比 DOM 文本准）
            // 先切到目标型号的 SKU：一个商品链接里有多档型号，默认选中往往不是我们要的
            const sku = job.config.collect.switchSku
                ? await (0, sku_1.selectSku)(page, 'pdd', job.model.name).catch(() => ({ ok: false, selected: '', reason: '切 SKU 异常' }))
                : { ok: true, selected: '', reason: '' };
            if (!sku.ok) {
                throw new types_1.ParseError(`切不到目标型号「${job.model.name}」：${sku.reason ?? '未知'}`, sku.selected?.slice(0, 40));
            }
            // 再校验页面标题，防止引流款（标题 5070 实际 2060）
            const pageInfo = await page.evaluate(`({
          title: document.title,
          h1: (document.querySelector('h1')?.textContent || '').trim(),
        })`);
            const titleText = `${pageInfo?.title ?? ''} ${pageInfo?.h1 ?? ''}`.trim();
            const pddMatch = (0, quote_1.modelMatches)(job.model.name, titleText);
            // 标题抓不到（空/过短）时不能判成「引流」，否则会把正常商品误杀
            if (titleText.length >= 4 && !pddMatch.matches) {
                throw new types_1.ParseError(pddMatch.reason ?? '标题与型号不符', titleText.slice(0, 40));
            }
            // 正文兜底：收集所有「上下文 + ¥数字」候选，按区间和关键词挑，避免被 ¥1 这类噪声带偏
            const rawCandidates = await page.evaluate(price_text_1.COLLECT_PRICES_JS).catch(() => '[]');
            let candidates = [];
            try {
                candidates = JSON.parse(rawCandidates || '[]');
            }
            catch {
                candidates = [];
            }
            const pickedPrice = (0, price_text_1.pickPrice)(candidates);
            if (pickedPrice.price) {
                return { price: pickedPrice.price, status: constants_1.STATUS.OK, note: 'browser-text' };
            }
            const raw = await page.evaluate(String.raw `(() => {
        try {
          const rd = window.rawData
          const goods = rd?.store?.initDataObj?.goods || rd?.goods || rd?.initDataObj?.goods
          if (!goods) return ''
          const candidates = [
            goods.minOnSaleGroupPrice, goods.minGroupPrice, goods.minOnSaleNormalPrice,
            goods.minNormalPrice, goods.marketPrice, goods.price,
          ]
          for (const value of candidates) {
            if (value) return String(value)
          }
          return ''
        } catch (e) { return '' }
      })()`);
            const rawPrice = (0, normalize_1.parsePrice)(raw);
            if (rawPrice) {
                const shop = await page.evaluate(`(() => {
          try {
            const g = window.rawData?.store?.initDataObj?.goods
            return String(g?.mallName || g?.mall?.mallName || '')
          } catch (e) { return '' }
        })()`);
                return { price: rawPrice, status: constants_1.STATUS.OK, note: `rawData · ${shop || '未知店铺'}` };
            }
            const text = await page.evaluate(`(() => {
          const nodes = Array.from(document.querySelectorAll('[class*="price" i]'))
          for (const node of nodes) {
            const t = (node.textContent || '').trim()
            if (/[0-9]/.test(t) && t.length < 24) return t
          }
          return ''
        })()`);
            const price = (0, normalize_1.parsePrice)(text);
            if (!price)
                throw new types_1.ParseError('浏览器渲染后仍未取到拼多多价格', text.slice(0, 80));
            return { price, status: constants_1.STATUS.OK, note: 'browser' };
        }
        finally {
            if (page)
                await page.close().catch(() => undefined);
        }
    },
};
//# sourceMappingURL=pdd.js.map