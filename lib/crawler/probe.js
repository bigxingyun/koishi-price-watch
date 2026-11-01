"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOBILE_UA = void 0;
exports.probePage = probePage;
exports.offerUrl = offerUrl;
exports.isLoginDomain = isLoginDomain;
const browser_1 = require("./browser");
const fetcher_1 = require("./fetcher");
Object.defineProperty(exports, "MOBILE_UA", { enumerable: true, get: function () { return fetcher_1.MOBILE_UA; } });
async function probePage(ctx, config, url, options = {}) {
    const started = Date.now();
    try {
        return await (0, browser_1.withRenderPage)(ctx, config, async (page) => {
            if (!page.goto)
                throw new Error('浏览器实现不支持 goto');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
            await new Promise((resolve) => setTimeout(resolve, options.waitMs ?? 3500));
            const info = await page.evaluate(`(() => {
        const texts = Array.from(document.querySelectorAll('[class*="price" i], [class*="Price"]'))
          .slice(0, 8)
          .map((el) => (el.textContent || '').trim().slice(0, 32))
          .filter(Boolean)
        return {
          href: location.href,
          title: document.title,
          priceTexts: texts,
          bodyHead: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 240),
        }
      })()`);
            return {
                ok: true,
                href: info.href,
                title: info.title,
                priceTexts: info.priceTexts,
                bodyHead: info.bodyHead,
                elapsedMs: Date.now() - started,
            };
        });
    }
    catch (error) {
        return {
            ok: false,
            href: url,
            title: '',
            priceTexts: [],
            bodyHead: '',
            error: error.message,
            elapsedMs: Date.now() - started,
        };
    }
}
/** 平台 → 商品页 URL */
function offerUrl(platform, itemId) {
    if (platform === 'jd')
        return `https://item.m.jd.com/product/${itemId}.html`;
    if (platform === 'pdd')
        return `https://mobile.yangkeduo.com/goods.html?goods_id=${itemId}`;
    return `https://item.taobao.com/item.htm?id=${itemId}`;
}
/** 判断页面是否落在登录域 */
function isLoginDomain(href) {
    return /passport\.|login\.|signin\.|\/login|\.taobao\.com\/member/i.test(href);
}
//# sourceMappingURL=probe.js.map