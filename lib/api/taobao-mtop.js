"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taobaoMtopPrice = taobaoMtopPrice;
const node_crypto_1 = require("node:crypto");
const browser_1 = require("../crawler/browser");
/**
 * 淘宝 mtop 接口（开源爬虫的通用做法）。
 *
 * 为什么用它：淘宝商品页对未登录/风控会话一律跳登录页，但 **mtop 详情接口**
 * 只要凑齐 `_m_h5_tk` token + md5 签名就能拿到结构化数据（含价格、店铺、标题），
 * 这是绝大多数「淘宝价格监控」项目的核心做法：
 *
 *   1. 第一次请求不带有效 sign → 服务端通过 Set-Cookie 下发 `_m_h5_tk`
 *   2. token = `_m_h5_tk` 中下划线前那一段
 *   3. sign = md5(`${token}&${t}&${appKey}&${data}`)
 *   4. 带 sign 再请求一次，拿到 `data.apiStack[0].value`（JSON 字符串）
 *
 * 全程在浏览器上下文里 fetch，cookie 自动携带，不需要手工管理 Cookie 头。
 */
const APP_KEY = '12574478';
const API = 'mtop.taobao.detail.getdetail';
const VERSION = '6.0';
function md5(input) {
    return (0, node_crypto_1.createHash)('md5').update(input).digest('hex');
}
/** 跳到 mtop 地址并等它把 x5referer 那次跳转走完，直到正文是 JSON */
async function readJsonBody(page, url, timeoutMs) {
    for (let attempt = 0; attempt < 2; attempt++) {
        await page.goto?.(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => undefined);
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            const body = String((await page.evaluate('document.body ? document.body.innerText : ""')) ?? '').trim();
            if (body.startsWith('{'))
                return body;
            // 还是 x5referer 脚本：再等，让它自己跳
            if (!body.includes('x5referer'))
                return body;
        }
    }
    return String((await page.evaluate('document.body ? document.body.innerText : ""')) ?? '').trim();
}
async function taobaoMtopPrice(ctx, config, itemId) {
    const data = JSON.stringify({ itemNumId: String(itemId) });
    const browser = await (0, browser_1.acquireProfile)(ctx, config, 'taobao');
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    });
    try {
        if (!page.goto)
            return { ok: false, message: '浏览器不支持 goto' };
        // 先落一个淘宝域，保证 _m_h5_tk 有下发的地方
        await page.goto('https://m.taobao.com/', { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
        await new Promise((resolve) => setTimeout(resolve, 800));
        // ① 空 sign：必须用**页面跳转**而不是 fetch。
        // h5api 对跨域 fetch 会返回一段 x5referer 跳转脚本，只有让页面真的跳过去，
        // 那段脚本才会执行并落下 _m_h5_tk（这是开源实现里的关键一步）。
        const firstUrl = `https://h5api.m.taobao.com/h5/${API}/${VERSION}/?jsv=2.4.8&appKey=${APP_KEY}&t=${Date.now()}&sign=x&api=${API}&v=${VERSION}&type=json&dataType=json&data=${encodeURIComponent(data)}`;
        await readJsonBody(page, firstUrl, config.collect.timeoutMs);
        const token = await page.evaluate(`(() => {
      const raw = document.cookie.split('; ').find((c) => c.startsWith('_m_h5_tk='))
      return raw ? raw.slice('_m_h5_tk='.length).split('_')[0] : ''
    })()`);
        if (!token) {
            return { ok: false, message: '淘宝 mtop 未下发 _m_h5_tk（被风控或需要登录）' };
        }
        // ② 带签名再请求
        const t = Date.now();
        const sign = md5(`${token}&${t}&${APP_KEY}&${data}`);
        const secondUrl = `https://h5api.m.taobao.com/h5/${API}/${VERSION}/?jsv=2.4.8&appKey=${APP_KEY}&t=${t}&sign=${sign}&api=${API}&v=${VERSION}&type=json&dataType=json&data=${encodeURIComponent(data)}`;
        const payload = await readJsonBody(page, secondUrl, config.collect.timeoutMs);
        if (!payload)
            return { ok: false, message: '淘宝 mtop 无响应' };
        let body;
        try {
            body = JSON.parse(payload);
        }
        catch {
            return { ok: false, message: `淘宝 mtop 返回非 JSON：${payload.slice(0, 60)}` };
        }
        const parsed = body;
        const ret = parsed.ret?.[0] ?? '';
        if (!ret.startsWith('SUCCESS')) {
            return { ok: false, message: `淘宝 mtop 返回 ${ret || '未知错误'}` };
        }
        const stack = parsed.data?.apiStack?.[0]?.value;
        if (!stack)
            return { ok: false, message: '淘宝 mtop 没有 apiStack 数据' };
        const detail = JSON.parse(stack);
        const skuInfo = detail.skuCore?.sku2info ?? {};
        const priceText = Object.values(skuInfo).find((v) => v?.price?.priceText)?.price?.priceText ??
            detail.skuCore?.price?.priceText ??
            '';
        const price = Number(String(priceText).replace(/[^\d.]/g, ''));
        if (!price)
            return { ok: false, message: '淘宝 mtop 返回里没有价格字段' };
        return {
            ok: true,
            price: {
                price,
                shopName: detail.seller?.shopName ?? detail.seller?.nick,
                title: detail.item?.title,
                note: 'mtop',
            },
            message: 'ok',
        };
    }
    catch (error) {
        return { ok: false, message: `淘宝 mtop 异常：${error.message}` };
    }
    finally {
        await page.close().catch(() => undefined);
    }
}
//# sourceMappingURL=taobao-mtop.js.map