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
exports.jdAdapter = void 0;
exports.extractSku = extractSku;
exports.parseJdHtml = parseJdHtml;
/**
 * 京东适配器。
 *
 * 实测结论（2026-10，本机 Chrome 156 + 真实请求）：
 * 1. `item.jd.com/{sku}.html` 已是**纯 SPA 空壳**：两个不同 SKU 返回同一个 35 KB 页面，
 *    `skuId` / `price` 出现次数为 0，价格完全靠前端 JS 拉取
 * 2. 经典的 `p.3.cn/prices/mgets` 接口已不可用（直接超时）
 * 3. 手机页 `item.m.jd.com/product/{sku}.html` 有数据，但**价格被问号混淆**：
 *    `"priceFloor":{"price":"3??9"}`、`"4?"` —— 这是专门针对爬虫的对抗
 *
 * 所以策略是「HTTP 取证 + 浏览器兜底」：
 * - 先用手机页做一次 HTTP 探测：能拿到明文价就用（偶尔页面会带 `jdprice_amount`）
 * - 拿不到（混淆/空壳）→ 用浏览器渲染真实 DOM 取价格文本
 * - 都拿不到 → 抛 ParseError，由采集器记失败，**绝不猜**
 */
const constants_1 = require("../constants");
const fetcher_1 = require("../crawler/fetcher");
const normalize_1 = require("../crawler/normalize");
const quote_1 = require("../domain/quote");
const types_1 = require("../crawler/types");
// 京东的登录态是 PC 端的（pt_key/pt_pin 在 .jd.com 上）。
// 移动端站点还会校验 wskey 等移动专有凭据，直接用移动 UA 会表现为「未登录」。
const DESKTOP_ITEM = (sku) => `https://item.jd.com/${sku}.html`;
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
/** 从 offer 的 itemId / url 里取 skuId */
function extractSku(job) {
    const fromItem = job.offer.itemId.match(/(\d{6,})/);
    if (fromItem)
        return fromItem[1];
    const fromUrl = job.offer.url.match(/(\d{6,})/);
    return fromUrl ? fromUrl[1] : null;
}
/** 从手机页 HTML 里按优先级找明文价格（分） */
function parseJdHtml(html) {
    // ① 活动页偶尔会带真实数字
    const real = html.match(/jdprice_amount"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/);
    if (real) {
        const price = (0, normalize_1.parsePrice)(real[1]);
        if (price)
            return { price };
    }
    // ② 老结构里的 "p":"1234.00"
    const p = html.match(/"p"\s*:\s*"([0-9]+(?:\.[0-9]+)?)"/);
    if (p) {
        const price = (0, normalize_1.parsePrice)(p[1]);
        if (price)
            return { price };
    }
    // ③ priceFloor：只有当它没被混淆时才可信
    const floor = html.match(/"priceFloor"\s*:\s*\{[^}]*"price"\s*:\s*"([^"]+)"/);
    if (floor && !/[?？*]/.test(floor[1])) {
        const price = (0, normalize_1.parsePrice)(floor[1]);
        if (price)
            return { price };
    }
    return null;
}
async function fetchViaBrowser(job, sku) {
    const { acquireProfile } = await Promise.resolve().then(() => __importStar(require('../crawler/browser')));
    const { browseToProduct, humanDelay } = await Promise.resolve().then(() => __importStar(require('../crawler/human')));
    const browser = await acquireProfile(job.ctx, job.config, 'jd');
    let page;
    try {
        page = await browser.newPage({
            viewport: { width: 1280, height: 900 },
            userAgent: DESKTOP_UA,
            isMobile: false,
            hasTouch: true,
            deviceScaleFactor: 2,
        });
        if (!page.goto)
            throw new types_1.ParseError('浏览器实现不支持 goto');
        // 先走真人路径（首页 → 搜索 → 点商品卡），直连容易被风控
        const walked = await browseToProduct(page, {
            home: 'https://www.jd.com/',
            search: (keyword) => `https://search.jd.com/Search?keyword=${encodeURIComponent(keyword)}&enc=utf-8`,
        }, sku, job.model.name);
        if (!walked) {
            await page.goto(DESKTOP_ITEM(sku), {
                waitUntil: 'domcontentloaded',
                timeout: job.config.collect.timeoutMs,
            });
        }
        await humanDelay({ delay: [1200, 2600] });
        if (page.waitForSelector) {
            await page.waitForSelector('[class*="price"]', { timeout: 8000 }).catch(() => undefined);
        }
        // 优先读页面初始化数据（pageConfig / _itemInfo），它比 DOM 文本稳：
        // DOM 里的价格会被混淆成 ¥1??9，而初始化数据里若是真价就是数字；店铺名/标题也在这里。
        const meta = await page.evaluate(`(() => {
      const out = { price: '', title: '', shop: '', href: location.href, pageTitle: document.title }
      const pick = (obj) => {
        if (!obj || typeof obj !== 'object') return
        const p = obj.price ?? obj.jPrice ?? obj.p ?? obj.minPrice ?? obj.lowestPrice
        if (!out.price && p !== undefined && p !== null) out.price = String(p)
        if (!out.title) out.title = obj.name || obj.skuName || obj.title || ''
        if (!out.shop) out.shop = obj.shopName || obj.venderName || obj.shop?.name || ''
      }
      const cfg = window.pageConfig
      if (cfg) { pick(cfg.product); pick(cfg.item); pick(cfg) }
      pick(window._itemInfo)
      pick(window.__INITIAL_STATE__?.product)
      return out
    })()`);
        // 标题与目标型号不符 → 拒绝，避免「5070 标题挂 2060」的引流款
        const titleText = [meta?.title, meta?.pageTitle].filter(Boolean).join(' ');
        const match = (0, quote_1.modelMatches)(job.model.name, titleText);
        if (titleText.trim().length >= 4 && !match.matches)
            throw new types_1.ParseError(match.reason ?? '标题与型号不符', titleText.slice(0, 40));
        const fromConfig = (0, normalize_1.parsePrice)(meta?.price ?? '');
        if (fromConfig) {
            // 初始化数据里的价格可以直接用，顺手把店铺名带回上层
            return { price: fromConfig, status: constants_1.STATUS.OK, note: `pageConfig · ${meta?.shop || '未知店铺'}` };
        }
        const text = await page.evaluate(`(() => {
        const nodes = Array.from(document.querySelectorAll('[class*="price"], [class*="Price"]'))
        for (const node of nodes) {
          const text = (node.textContent || '').trim()
          if (/[0-9]/.test(text) && text.length < 24) return text
        }
        return ''
      })()`);
        const price = (0, normalize_1.parsePrice)(text);
        if (!price) {
            // 只认「跳到登录域」或「标题像登录页」；扫整页 HTML 会把页头的登录链接算进来（实测 100% 误判）
            const info = await page.evaluate('({ href: location.href, title: document.title })');
            const onLoginDomain = /passport\.jd\.com|login\.jd\.com/.test(info?.href ?? '');
            if (onLoginDomain || (0, normalize_1.looksLikeAuthWall)(info?.title ?? '')) {
                throw new types_1.AuthError('京东要求登录/验证', 'jd');
            }
            throw new types_1.ParseError('浏览器渲染后仍未取到价格', `${info?.title ?? ''} | ${text.slice(0, 40)}`);
        }
        return { price, status: constants_1.STATUS.OK, note: 'browser' };
    }
    finally {
        if (page)
            await page.close().catch(() => undefined);
    }
}
exports.jdAdapter = {
    platform: 'jd',
    needsBrowser: true,
    async fetch(job) {
        const sku = extractSku(job);
        if (!sku)
            throw new types_1.ParseError(`无法从 ${job.offer.itemId} 解析出京东 skuId`, job.offer.itemId);
        // ① HTTP 探测
        let httpError;
        try {
            const { body } = await (0, fetcher_1.fetchText)(job.ctx, DESKTOP_ITEM(sku), {
                ua: DESKTOP_UA,
                timeout: job.config.collect.timeoutMs,
                retries: 0,
                headers: { Referer: 'https://item.jd.com/' },
            });
            const title = (0, normalize_1.extractTitle)(body);
            if ((0, normalize_1.looksLikeDelisted)(title)) {
                return { price: 0, status: constants_1.STATUS.DELISTED, note: `页面标题提示下架：${title.slice(0, 40)}` };
            }
            // 登录墙只认标题：正文里必然有「登录」链接，扫正文会 100% 误判（实测踩过）
            if ((0, normalize_1.looksLikeAuthWall)(title)) {
                throw new types_1.AuthError('京东要求登录/验证', 'jd');
            }
            const parsed = parseJdHtml(body);
            if (parsed)
                return { price: parsed.price, listPrice: parsed.listPrice, status: constants_1.STATUS.OK, note: 'http' };
            throw new types_1.ParseError('京东价格被混淆（形如 3??9），HTTP 取不到明文');
        }
        catch (error) {
            if (error instanceof types_1.AuthError)
                throw error;
            httpError = error;
        }
        // ② 浏览器兜底
        if (job.config.collect.browserEnabled) {
            try {
                return await fetchViaBrowser(job, sku);
            }
            catch (error) {
                if (error instanceof types_1.AuthError)
                    throw error;
                const message = error.message;
                throw new types_1.ParseError(`京东采集失败：${message}`, String(httpError ?? '').slice(0, 120));
            }
        }
        // ③ 浏览器没开启：如实报告失败原因，不伪造价格
        const reason = httpError instanceof types_1.ParseError
            ? httpError.message
            : `京东 HTTP 探测失败：${httpError?.message ?? 'unknown'}`;
        throw new types_1.ParseError(`${reason}（可在配置里开启 browser.enabled 用浏览器渲染）`);
    },
};
//# sourceMappingURL=jd.js.map