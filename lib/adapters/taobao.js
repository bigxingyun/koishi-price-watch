"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taobaoAdapter = void 0;
exports.extractItemId = extractItemId;
exports.parseTaobaoHtml = parseTaobaoHtml;
/**
 * 淘宝 / 天猫适配器。
 *
 * 已知情况（需登录态）：
 * - 商品页 `item.taobao.com/item.htm?id=`，未登录常被重定向到 `login.taobao.com`
 * - 价格在页面内联 JSON（`g_config` / `TShop.Setup`）或异步接口里，接口需 `_m_h5_tk` + sign
 * - 因此策略与京东一致：HTTP 取证 → 浏览器渲染 → 拿不到就如实失败
 *
 * 说明：这个适配器写好了框架，但**没有经过登录态验证**（登录需要主人扫码），
 * 所以它现在跑起来大概率是 AuthError，这是已知且被如实报告的，不是静默失败。
 */
const constants_1 = require("../constants");
const fetcher_1 = require("../crawler/fetcher");
const methods_1 = require("../auth/methods");
const normalize_1 = require("../crawler/normalize");
const quote_1 = require("../domain/quote");
const browser_1 = require("../crawler/browser");
const human_1 = require("../crawler/human");
const sku_1 = require("../crawler/sku");
const probe_1 = require("../crawler/probe");
const types_1 = require("../crawler/types");
function extractItemId(job) {
    const fromItem = job.offer.itemId.match(/(\d{6,})/);
    if (fromItem)
        return fromItem[1];
    const fromUrl = job.offer.url.match(/[?&]id=(\d+)/);
    return fromUrl ? fromUrl[1] : null;
}
/** 从 HTML 的内联 JSON 里找价格（元） */
function parseTaobaoHtml(html) {
    // 常见字段：price / defaultItemPrice / promoPrice
    const patterns = [
        /"defaultItemPrice"\s*:\s*"([0-9.]+)"/,
        /"price"\s*:\s*"([0-9.]+)"/,
        /"promoPrice"\s*:\s*"([0-9.]+)"/,
        /g_config\s*=\s*\{[^}]*price\s*[:=]\s*"?([0-9.]+)/,
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (!match)
            continue;
        const price = (0, normalize_1.parsePrice)(match[1]);
        if (price)
            return price;
    }
    return null;
}
exports.taobaoAdapter = {
    platform: 'taobao',
    needsBrowser: true,
    async fetch(job) {
        const itemId = extractItemId(job);
        if (!itemId)
            throw new types_1.ParseError(`无法从 ${job.offer.itemId} 解析出淘宝商品 ID`, job.offer.itemId);
        const url = (0, probe_1.offerUrl)('taobao', itemId);
        let httpError;
        // ① HTTP 探测
        try {
            const { body } = await (0, fetcher_1.fetchText)(job.ctx, url, {
                ua: (0, methods_1.platformUaOf)('taobao', fetcher_1.MOBILE_UA),
                timeout: job.config.collect.timeoutMs,
                retries: 0,
                headers: { Referer: 'https://www.taobao.com/' },
            });
            if ((0, normalize_1.looksLikeAuthWall)(body.slice(0, 4000)))
                throw new types_1.AuthError('淘宝要求登录', 'taobao');
            const price = parseTaobaoHtml(body);
            if (price)
                return { price, status: constants_1.STATUS.OK, note: 'http' };
            throw new types_1.ParseError('淘宝页面未找到价格字段');
        }
        catch (error) {
            if (error instanceof types_1.AuthError)
                throw error;
            httpError = error;
        }
        // ② 浏览器兜底
        if (!job.config.collect.browserEnabled) {
            throw new types_1.ParseError(`${httpError?.message ?? 'HTTP 探测失败'}（浏览器采集未开启；淘宝基本必须登录+浏览器）`);
        }
        const browser = await (0, browser_1.acquireProfile)(job.ctx, job.config, 'taobao');
        let page;
        try {
            page = await browser.newPage({
                viewport: { width: 1280, height: 900 }, userAgent: (0, methods_1.platformUaOf)('taobao', fetcher_1.MOBILE_UA),
            });
            if (!page.goto)
                throw new types_1.ParseError('浏览器实现不支持 goto');
            // 先走真人路径：首页 → 搜索 → 点进商品卡（直连会被风控踢回登录页）
            const walked = await (0, human_1.browseToProduct)(page, {
                home: 'https://m.taobao.com/',
                search: (keyword) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(keyword)}`,
            }, itemId, job.model.name);
            if (!walked) {
                // 真人路径没走通才直连，保证可用性
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: job.config.collect.timeoutMs });
            }
            await (0, human_1.humanDelay)({ delay: [1500, 3000] });
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const info = await page.evaluate(`(() => {
          const fromNodes = Array.from(document.querySelectorAll('[class*="price" i], [class*="Price"]'))
            .slice(0, 8)
            .map((el) => (el.textContent || '').trim().slice(0, 32))
            .filter(Boolean)
          // 淘宝新页面常把价格放在普通文本里，补一层正文提取
          const body = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 4000)
          const fromBody = []
          const re = /[¥￥]\s*([0-9]{2,6}(?:\.[0-9]{1,2})?)/g
          let m
          while ((m = re.exec(body)) && fromBody.length < 6) fromBody.push(m[1])
          return { href: location.href, title: document.title, texts: [...fromNodes, ...fromBody], body }
        })()`);
            if ((0, probe_1.isLoginDomain)(info?.href ?? '') || (0, normalize_1.looksLikeAuthWall)(info?.title ?? '')) {
                throw new types_1.AuthError('淘宝要求登录（商品页被重定向到登录页）', 'taobao');
            }
            // 先切到目标型号的 SKU
            const sku = job.config.collect.switchSku
                ? await (0, sku_1.selectSku)(page, 'taobao', job.model.name).catch(() => ({ ok: false, selected: '', reason: '切 SKU 异常' }))
                : { ok: true, selected: '', reason: '' };
            if (!sku.ok) {
                throw new types_1.ParseError(`切不到目标型号「${job.model.name}」：${sku.reason ?? '未知'}`, sku.selected?.slice(0, 40));
            }
            // 标题与目标型号不符 → 拒绝，避免把引流款的价格当成目标型号
            const taobaoTitle = (info?.title ?? '').trim();
            const match = (0, quote_1.modelMatches)(job.model.name, taobaoTitle);
            if (taobaoTitle.length >= 4 && !match.matches)
                throw new types_1.ParseError(match.reason ?? '标题与型号不符', taobaoTitle.slice(0, 40));
            for (const text of info?.texts ?? []) {
                const price = (0, normalize_1.parsePrice)(text);
                if (price)
                    return { price, status: constants_1.STATUS.OK, note: 'browser' };
            }
            throw new types_1.ParseError('浏览器渲染后仍未取到淘宝价格', (info?.title ?? '').slice(0, 40));
        }
        finally {
            if (page)
                await page.close().catch(() => undefined);
        }
    },
};
//# sourceMappingURL=taobao.js.map