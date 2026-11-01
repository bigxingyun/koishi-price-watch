"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeOf = exports.THEMES = exports.SHEET_CATEGORIES = void 0;
exports.sheetLabel = sheetLabel;
exports.renderSheet = renderSheet;
exports.renderSheets = renderSheets;
exports.buildValueRows = buildValueRows;
exports.renderValueSheet = renderValueSheet;
exports.renderLadderSheet = renderLadderSheet;
const constants_1 = require("../constants");
const browser_1 = require("../crawler/browser");
const themes_1 = require("./themes");
Object.defineProperty(exports, "THEMES", { enumerable: true, get: function () { return themes_1.THEMES; } });
Object.defineProperty(exports, "themeOf", { enumerable: true, get: function () { return themes_1.themeOf; } });
const bench_1 = require("../stats/bench");
/** 单张图的像素上限（Chromium 纹理限制），只用于防御极端情况 */
const MAX_SIDE = 32000;
exports.SHEET_CATEGORIES = ['gpu', 'ram', 'ssd'];
function sheetLabel(category) {
    return constants_1.CATEGORY_LABEL[category] ?? category;
}
/** 截图管线：宽度固定、高度按内容撑开 */
async function shoot(ctx, config, html, width) {
    const shot = await (0, browser_1.withRenderPage)(ctx, config, async (page) => {
        await page.setViewportSize({ width, height: 200 });
        await page.setContent(html, { waitUntil: 'load' });
        await new Promise((resolve) => setTimeout(resolve, 120));
        const height = await page.evaluate('Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 400))');
        const finalHeight = Math.min(MAX_SIDE, Math.max(400, height));
        await page.setViewportSize({ width, height: finalHeight });
        const buffer = await page.screenshot({ type: 'png', fullPage: false });
        return { buffer, height: finalHeight };
    });
    return { buffer: shot.buffer, height: shot.height, width };
}
async function renderSheet(ctx, config, digest, category, theme) {
    const themeKey = (theme ?? config.basic.theme);
    const width = Math.max(480, Math.min(1600, config.basic.imageWidth || 960));
    const sheet = (0, themes_1.buildSheet)(digest, category, sheetLabel(category), themeKey, width);
    const html = (0, themes_1.renderHtml)(sheet);
    const shot = await (0, browser_1.withRenderPage)(ctx, config, async (page) => {
        // 测量视口必须小，否则 scrollHeight 永远不小于视口高度 → 底部留白
        await page.setViewportSize({ width, height: 200 });
        await page.setContent(html, { waitUntil: 'load' });
        await new Promise((resolve) => setTimeout(resolve, 120));
        const height = await page.evaluate('Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 400))');
        const finalHeight = Math.min(MAX_SIDE, Math.max(400, height));
        await page.setViewportSize({ width, height: finalHeight });
        const buffer = await page.screenshot({ type: 'png', fullPage: false });
        return { buffer, height: finalHeight };
    });
    return {
        category,
        label: sheetLabel(category),
        buffer: shot.buffer,
        width,
        height: shot.height,
        mime: 'image/png',
        theme: themeKey,
    };
}
/** 渲染全部品类（显卡 → 内存 → 固态），没有数据的品类跳过 */
async function renderSheets(ctx, config, digest, theme) {
    const out = [];
    for (const category of exports.SHEET_CATEGORIES) {
        const has = digest.items.some((item) => item.category === category);
        if (!has)
            continue;
        out.push(await renderSheet(ctx, config, digest, category, theme));
    }
    return out;
}
// ── 排行类报表（性价比榜 / 天梯图）──────────────────
/** 截图管线：宽度固定、高度按内容撑开 */
async function shootSheet(ctx, config, html, width) {
    const shot = await (0, browser_1.withRenderPage)(ctx, config, async (page) => {
        await page.setViewportSize({ width, height: 200 });
        await page.setContent(html, { waitUntil: 'load' });
        await new Promise((resolve) => setTimeout(resolve, 120));
        const height = await page.evaluate('Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 400))');
        const finalHeight = Math.min(MAX_SIDE, Math.max(400, height));
        await page.setViewportSize({ width, height: finalHeight });
        const buffer = await page.screenshot({ type: 'png', fullPage: false });
        return { buffer, height: finalHeight };
    });
    return { buffer: shot.buffer, height: shot.height, width };
}
/** 组装性价比行：显卡看「性能/价格」，内存固态看「每 GB 价格」 */
function buildValueRows(digest, category) {
    const items = digest.items.filter((item) => item.category === category);
    const rows = category === 'gpu'
        ? items.map((item) => (0, bench_1.gpuValue)(item.name, item.price / 100))
        : items.map((item) => (0, bench_1.capacityValue)(item.name, item.price / 100));
    return rows.filter((row) => !!row);
}
async function renderValueSheet(ctx, config, digest, category, theme) {
    const themeKey = (theme ?? config.basic.theme);
    const width = Math.max(480, Math.min(1600, config.basic.imageWidth || 960));
    const sheet = (0, themes_1.buildValueSheet)(digest, category, buildValueRows(digest, category), themeKey, width);
    if (!sheet.items.length)
        throw new Error('没有可排行的数据（缺型号或价格）');
    const shot = await shootSheet(ctx, config, (0, themes_1.renderHtml)(sheet), width);
    return { category, label: sheet.title, buffer: shot.buffer, width, height: shot.height, mime: 'image/png', theme: themeKey };
}
async function renderLadderSheet(ctx, config, digest, theme) {
    const themeKey = (theme ?? config.basic.theme);
    const width = Math.max(480, Math.min(1600, config.basic.imageWidth || 960));
    const rows = digest.items
        .filter((item) => item.category === 'gpu')
        .map((item) => ({ name: item.name, price: item.price / 100, score: (0, bench_1.scoreOfGpu)(item.name) ?? 0 }))
        .filter((row) => row.score > 0);
    if (!rows.length)
        throw new Error('没有认出任何显卡型号的性能分');
    const sheet = (0, themes_1.buildLadderSheet)(digest, rows, themeKey, width);
    const shot = await shootSheet(ctx, config, (0, themes_1.renderHtml)(sheet), width);
    return { category: 'gpu', label: sheet.title, buffer: shot.buffer, width, height: shot.height, mime: 'image/png', theme: themeKey };
}
//# sourceMappingURL=image.js.map