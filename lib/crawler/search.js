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
exports.searchUrlOf = searchUrlOf;
exports.scoreTitle = scoreTitle;
exports.searchPlatform = searchPlatform;
exports.queueSearch = queueSearch;
exports.runPendingSearch = runPendingSearch;
const repo = __importStar(require("../store/repo"));
const browser_1 = require("./browser");
const fetcher_1 = require("./fetcher");
const SEARCH_URL = {
    jd: (keyword) => `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(keyword)}`,
    pdd: (keyword) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(keyword)}`,
    taobao: (keyword) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(keyword)}`,
};
const ID_PATTERNS = {
    jd: /item\.(?:m\.)?jd\.com\/(?:product\/)?(\d{6,})/,
    pdd: /goods_id=(\d{6,})/,
    taobao: /[?&](?:id|itemId)=(\d{6,})/,
};
function searchUrlOf(platform, keyword) {
    const build = SEARCH_URL[platform];
    return build ? build(keyword) : null;
}
function normalize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
}
/**
 * 标题与关键词的相似度（0~1）。
 * 型号里的数字权重更高：5070 和 5080 的中文部分完全一样，只有数字能区分。
 */
function scoreTitle(keyword, title) {
    const keywordTokens = normalize(keyword).split(' ').filter(Boolean);
    const normalizedTitle = normalize(title);
    if (!keywordTokens.length || !normalizedTitle)
        return 0;
    const hitTokens = keywordTokens.filter((token) => normalizedTitle.includes(token));
    const wordScore = hitTokens.length / keywordTokens.length;
    const numberTokens = keywordTokens.filter((token) => /\d/.test(token));
    const hitNumbers = numberTokens.filter((token) => normalizedTitle.includes(token));
    const numberScore = numberTokens.length ? hitNumbers.length / numberTokens.length : 0;
    return Number((wordScore * 0.6 + numberScore * 0.4).toFixed(3));
}
const LOGIN_PAGE = /login\.|passport\.|\/login|plogin/i;
async function searchPlatform(ctx, config, platform, keyword, limit = 5) {
    const url = searchUrlOf(platform, keyword);
    const pattern = ID_PATTERNS[platform];
    if (!url || !pattern)
        return { hits: [], needsLogin: false, note: `不支持在 ${platform} 搜索` };
    let browser;
    try {
        browser = await (0, browser_1.acquireProfile)(ctx, config, platform);
    }
    catch (error) {
        return { hits: [], needsLogin: false, note: error.message };
    }
    const page = await browser.newPage({
        viewport: { width: 420, height: 900 },
        userAgent: fetcher_1.MOBILE_UA,
        isMobile: true,
        hasTouch: true,
    });
    try {
        if (!page.goto)
            return { hits: [], needsLogin: false, note: '浏览器不支持 goto' };
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
        // 等内容真正渲染：拼多多/京东的列表是懒加载的，
        // 只看 <a> 数量会在「页面还是空白」时直接判失败（曾被误判成需要登录）。
        // 判据改成：正文有实质内容（去掉零宽字符后 > 200 字）或链接够多。
        let currentUrl = '';
        let ready = false;
        for (let i = 0; i < 12; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            currentUrl = (await page.evaluate('location.href')) ?? '';
            if (LOGIN_PAGE.test(currentUrl))
                break;
            if (i === 4) {
                // 滚动触发懒加载
                await page.evaluate('window.scrollBy(0, 600)').catch(() => undefined);
            }
            const state = await page.evaluate(`({
        links: document.querySelectorAll('a[href]').length,
        text: (document.body ? document.body.innerText : '').replace(/[\\u200b-\\u200d]/g, '').replace(/\\s+/g, ' ').length,
      })`);
            if ((state?.links ?? 0) > 5 || (state?.text ?? 0) > 200) {
                ready = true;
                break;
            }
        }
        if (LOGIN_PAGE.test(currentUrl)) {
            return {
                hits: [],
                needsLogin: true,
                note: `搜索页被重定向到登录页（${(currentUrl ?? '').slice(0, 60)}）`,
            };
        }
        if (!ready) {
            return {
                hits: [],
                needsLogin: false,
                note: '搜索页 12 秒内没有渲染出内容（可能加载很慢或被风控），不是登录问题',
            };
        }
        const links = await page.evaluate(`(() => {
      const out = []
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href || ''
        const text = (a.textContent || '').replace(/\\s+/g, ' ').trim()
        if (href && text) out.push({ href, text })
      }
      for (const el of document.querySelectorAll('[data-item-id], [data-goods-id]')) {
        const id = el.getAttribute('data-item-id') || el.getAttribute('data-goods-id')
        if (id) out.push({ href: 'item://' + id, text: (el.textContent || '').replace(/\\s+/g, ' ').trim() })
      }
      return out.slice(0, 400)
    })()`);
        const seen = new Set();
        const hits = [];
        for (const link of links ?? []) {
            const itemId = link.href.startsWith('item://')
                ? link.href.slice(7)
                : (link.href.match(pattern)?.[1] ?? null);
            if (!itemId || seen.has(itemId))
                continue;
            seen.add(itemId);
            const title = link.text.slice(0, 80);
            if (title.length < 4)
                continue;
            hits.push({ itemId, title, url: link.href, score: scoreTitle(keyword, title) });
        }
        hits.sort((a, b) => b.score - a.score);
        if (hits.length)
            return { hits: hits.slice(0, limit), needsLogin: false };
        // 一条都没拿到：再看页面是不是登录墙 / 空壳
        const body = (await page.evaluate('(document.body.innerText || "").slice(0, 300)')) ?? '';
        const loginish = /登录|扫码|验证码|下载.*APP/i.test(body);
        const bare = body.trim().length < 30;
        if (loginish || bare) {
            return {
                hits: [],
                needsLogin: true,
                note: loginish
                    ? `搜索页要求登录（页面提示：${body.replace(/\s+/g, ' ').slice(0, 40)}）`
                    : '搜索页没返回任何内容（多为未登录：接口对匿名会话基本空白）',
            };
        }
        if (platform === 'pdd' || platform === 'jd') {
            return {
                hits: [],
                needsLogin: false,
                note: '页面已渲染出商品，但拿不到可用的商品 ID（这些平台的卡片不是 a 标签），需要手动绑定商品链接',
            };
        }
        return { hits: [], needsLogin: false };
    }
    catch (error) {
        return { hits: [], needsLogin: false, note: error.message };
    }
    finally {
        await page.close().catch(() => undefined);
    }
}
/** 记住「等登录后再搜一次」的请求 */
async function queueSearch(ctx, platform, keyword) {
    await repo.metaSet(ctx, 'search:pending', JSON.stringify({ platform, keyword }));
}
function formatHits(platform, keyword, hits, note) {
    if (!hits.length) {
        return `登录成功，但重试搜索「${keyword}」仍然没结果${note ? '：' + note : ''}`;
    }
    return [
        `登录成功，已重试搜索「${keyword}」（${platform}）：`,
        ...hits.map((hit, index) => `${index + 1}. [${(hit.score * 100).toFixed(0)}%] ${hit.title.slice(0, 36)}　${hit.itemId}`),
        '',
        `要绑就给链接或 ID：价格 管理 绑定 「型号」 ${platform}`,
    ].join('\n');
}
/** 登录成功后调用：把挂起的搜索真的跑一遍 */
async function runPendingSearch(ctx, config) {
    const raw = await repo.metaGet(ctx, 'search:pending');
    if (!raw)
        return null;
    await repo.metaDel(ctx, 'search:pending').catch(() => undefined);
    let platform = '';
    let keyword = '';
    try {
        const parsed = JSON.parse(raw);
        platform = parsed.platform ?? '';
        keyword = parsed.keyword ?? '';
    }
    catch {
        return null;
    }
    if (!platform || !keyword)
        return null;
    const found = await searchPlatform(ctx, config, platform, keyword, 5);
    return { platform, keyword, text: formatHits(platform, keyword, found.hits, found.note) };
}
//# sourceMappingURL=search.js.map