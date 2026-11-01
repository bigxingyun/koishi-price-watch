"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.probePlatform = probePlatform;
const browser_1 = require("../crawler/browser");
const human_1 = require("../crawler/human");
/**
 * 页面探测（只读，用于制定仿真方案）。
 *
 * 为什么做成指令而不是外部脚本：
 * 探测必须在**已经登录的上下文**里做。外部脚本另开一个进程会锁住 profile 目录，
 * 或者复制 profile 时丢掉 WAL 里的 cookie（实测过：副本判为未登录）。
 * 所以让探测跑在插件进程内，直接复用这份登录态。
 *
 * 只读，不写库、不改配置、不点任何会下单的按钮。
 */
const SEARCH = {
    jd: (kw) => `https://search.jd.com/Search?keyword=${encodeURIComponent(kw)}&enc=utf-8`,
    taobao: (kw) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(kw)}`,
    pdd: (kw) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(kw)}`,
};
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PROBE_JS = `(() => {
  const clean = (s) => (s || '').replace(/[\\u200b-\\u200d]/g, '').replace(/\\s+/g, ' ').trim()
  const text = clean(document.body ? document.body.innerText : '')

  // 搜索框候选
  const inputs = Array.from(document.querySelectorAll('input')).slice(0, 12).map((el) => ({
    tag: el.tagName,
    type: el.type || '',
    id: el.id || '',
    name: el.name || '',
    ph: el.placeholder || '',
    cls: (el.className || '').toString().slice(0, 40),
  }))

  // 商品卡候选：带价格文本、尺寸可点
  const cards = []
  for (const el of Array.from(document.querySelectorAll('li, div, a'))) {
    const t = clean(el.textContent)
    if (!t || t.length < 6 || t.length > 160) continue
    if (!/[¥￥]\\s*[0-9]/.test(t)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 60 || r.height < 30) continue
    cards.push({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 40),
      href: el.querySelector('a[href]')?.href?.slice(0, 90) || '',
      text: t.slice(0, 50),
    })
    if (cards.length >= 8) break
  }

  // 价格候选
  const prices = Array.from(text.matchAll(/[¥￥]\\s*([0-9]{2,7}(?:\\.[0-9]+)?)/g)).slice(0, 6).map((m) => m[1])

  // SKU/规格区
  const sku = Array.from(document.querySelectorAll('[class*="sku" i], [class*="spec" i], [class*="size" i], [class*="sale" i]'))
    .slice(0, 8)
    .map((el) => ({ cls: (el.className || '').toString().slice(0, 40), text: clean(el.textContent).slice(0, 70) }))
    .filter((x) => x.text)

  // 登录/打码迹象
  // 已登录的页面里也可能残留「你好，请登录」占位，必须同时看有没有「退出/切换账号」
  const loginWall = /账号信息获取失败|请先登录后/.test(text) || (/请登录/.test(text) && !/退出|切换账号/.test(text))
  const masked = /[¥￥]\\s*\\.\\s*[0-9]?\\s*\\?|\\?\\?\\?/.test(text)

  return {
    href: location.href.slice(0, 100),
    title: document.title.slice(0, 40),
    textLen: text.length,
    head: text.slice(0, 120),
    inputs, cards, prices, sku,
    loginWall, masked,
    hasRawData: typeof window.rawData,
  }
})()`;
async function probePlatform(ctx, config, platform, keyword) {
    const urlOf = SEARCH[platform];
    if (!urlOf)
        throw new Error(`不支持的平台：${platform}`);
    const mobile = platform === 'pdd';
    const session = await (0, browser_1.acquireProfile)(ctx, config, platform);
    const page = await session.newPage({
        viewport: mobile ? { width: 414, height: 896 } : { width: 1440, height: 900 },
        userAgent: mobile ? MOBILE_UA : DESKTOP_UA,
        ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    try {
        if (!page.goto)
            throw new Error('浏览器不支持 goto');
        // ① 搜索页
        // ── 拼多多：SKU 面板专项探测（点开面板后 dump 内部元素） ──
        if (platform === 'pdd' && /^\d{6,}$/.test(keyword)) {
            const goodsUrl = `https://mobile.yangkeduo.com/goods.html?goods_id=${keyword}`;
            await page.goto(goodsUrl, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
            await new Promise((resolve) => setTimeout(resolve, 9000));
            // 先记录「点开前」面板状态
            const before = await page.evaluate(String.raw `(() => {
        const clean = (s) => (s || '').replace(/[\u200b-\u200d]/g, '').replace(/\s+/g, ' ').trim()
        const bars = Array.from(document.querySelectorAll('div, a, span'))
          .filter((el) => /已选|请选择|规格|型号/.test(clean(el.textContent)) && clean(el.textContent).length < 60)
          .slice(0, 6)
          .map((el) => { const r = el.getBoundingClientRect(); return { cls: (el.className||'').toString().slice(0,30), text: clean(el.textContent).slice(0,40), w: Math.round(r.width), h: Math.round(r.height) } })
        return { bars, panelFound: !!document.querySelector('[class*="sku-plus"], [class*="sku"]') }
      })()`).catch(() => null);
            // 依次尝试点击这些入口（拼多多的规格面板可能要点击「显存容量」这类摘要行才弹出）
            const ATTEMPTS = ['显存容量', '规格', '已选', '请选择', '款式'];
            const trail = [];
            const mouse = page.mouse;
            for (const label of ATTEMPTS) {
                const box = await page
                    .evaluate(String.raw `(() => {
              const target = '${label}'
              const clean = (s) => (s || '').replace(/[\u200b-\u200d]/g, '').replace(/\s+/g, ' ').trim()
              const el = Array.from(document.querySelectorAll('div, a, span'))
                .find((n) => clean(n.textContent).includes(target) && clean(n.textContent).length < 60 && n.getBoundingClientRect().height > 12)
              if (!el) return null
              el.scrollIntoView({ block: 'center' })
              const r = el.getBoundingClientRect()
              return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: clean(el.textContent).slice(0, 40) }
            })()`)
                    .catch(() => null);
                if (!box) {
                    trail.push({ label, found: false });
                    continue;
                }
                await mouse?.click?.(box.x, box.y).catch(() => undefined);
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const state = await page
                    .evaluate(`(() => {
            const clean = (s) => (s || '').replace(/[\u200b-\u200d]/g, '').replace(/\s+/g, ' ').trim()
            const body = clean(document.body.innerText)
            const panel = Array.from(document.querySelectorAll('div'))
              .find((el) => /已选[:：]/.test(clean(el.textContent)) && clean(el.textContent).length < 400)
            return JSON.stringify({
              clicked: true,
              hasSelectedText: /已选[:：]/.test(body),
              panelCls: panel ? (panel.className || '').toString().slice(0, 40) : '',
              panelHead: panel ? clean(panel.textContent).slice(0, 120) : '',
            })
          })()`)
                    .catch(() => '');
                trail.push({ label, box: box.text, state });
                if (state && String(state).includes('"hasSelectedText":true'))
                    break;
            }
            // 点开后再 dump：谁在面板里、文本、尺寸、可点性
            const after = await page.evaluate(String.raw `(() => {
        const clean = (s) => (s || '').replace(/[\u200b-\u200d]/g, '').replace(/\s+/g, ' ').trim()
        const panel = document.querySelector('[class*="sku-plus"], [class*="sku"]')
        const scope = panel || document.body
        const all = Array.from(scope.querySelectorAll('*'))
          .map((el) => {
            const t = clean(el.textContent)
            const r = el.getBoundingClientRect()
            return { tag: el.tagName, cls: (el.className||'').toString().slice(0,26), text: t.slice(0,44), w: Math.round(r.width), h: Math.round(r.height) }
          })
          .filter((x) => x.text && x.text.length < 44 && x.w > 20 && x.h > 10 && /\d{4}|ti|TI|型号|款式|容量/.test(x.text))
          .slice(0, 25)
        return { panelCls: panel ? (panel.className||'').toString().slice(0,40) : '(无面板容器)', candidates: all }
      })()`).catch(() => null);
            return {
                platform, keyword,
                search: { before },
                item: { after },
                text: [
                    '【SKU 面板探测】拼多多 goods_id=' + keyword,
                    '',
                    '── 点开前 ──',
                    JSON.stringify(before, null, 1).slice(0, 900),
                    '',
                    '── 点击尝试轨迹 ──',
                    JSON.stringify(trail, null, 1).slice(0, 1500),
                    '',
                    '── 点开后（面板内可点元素） ──',
                    JSON.stringify(after, null, 1).slice(0, 2600),
                ].join('\n'),
            };
        }
        // 京东搜索页有 React 受控输入 + 风控埋点，自动化触发不了；直接探商品页
        // 京东直接访问 search.jd.com 会返回「抱歉」风控页，必须像人一样从首页搜索
        if (platform === 'jd') {
            await page.goto('https://www.jd.com/', { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
            await new Promise((resolve) => setTimeout(resolve, 2500));
            // 真实鼠标 + 真实键盘（合成事件 React 不认）
            const typed = await (0, human_1.humanSearchReal)(page, keyword, {}).catch(() => false);
            await new Promise((resolve) => setTimeout(resolve, 4000));
            const landed = await page.evaluate('location.href').catch(() => '');
            console.log('京东搜索触发:', typed, '| 落地:', landed.slice(0, 70));
        }
        else {
            await page.goto(urlOf(keyword), { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
        }
        // 商品卡选择器：京东 li.gl-item / data-sku，淘宝 a[href*=item]，拼多多带价的 div
        const cardProbe = `(() => document.querySelectorAll('li.gl-item, [data-sku], a[href*="item"], a[href*="goods"]').length)`;
        let cardsSeen = 0;
        for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (i === 3 || i === 8)
                await page.evaluate('window.scrollBy(0, 800)').catch(() => undefined);
            cardsSeen = await page.evaluate(cardProbe).catch(() => 0);
            if ((cardsSeen ?? 0) > 3)
                break;
        }
        const search = await page.evaluate(PROBE_JS).catch((error) => ({ error: error.message }));
        search.cardsSeen = cardsSeen;
        // ② 从搜索结果里找第一个商品链接，进商品页再探一次
        const firstHref = await page
            .evaluate(`(() => {
        const a = Array.from(document.querySelectorAll('a[href]'))
          .find((el) => /item\.jd\.com|item\.taobao|goods\.html|[?&]id=\d{6,}|\\/\\d{6,}\.html/.test(el.href) && !/hotitem/.test(el.href))
        return a ? a.href : ''
      })()`)
            .catch(() => '');
        let item = null;
        if (firstHref) {
            await page.goto(firstHref, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs }).catch(() => undefined);
            await new Promise((resolve) => setTimeout(resolve, 5000));
            item = await page.evaluate(PROBE_JS).catch((error) => ({ error: error.message }));
        }
        const text = [
            `【探测】${platform}　关键词「${keyword}」`,
            '',
            '── 搜索页 ──',
            JSON.stringify(search, null, 1).slice(0, 1400),
            '',
            firstHref ? `── 商品页 ${firstHref.slice(0, 70)} ──` : '── 商品页：搜索结果里没找到商品链接 ──',
            item ? JSON.stringify(item, null, 1).slice(0, 1600) : '',
        ].join('\n');
        return { platform, keyword, search, item, text };
    }
    finally {
        await page.close().catch(() => undefined);
    }
}
//# sourceMappingURL=probe.js.map