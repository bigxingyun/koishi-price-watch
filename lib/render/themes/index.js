"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_LABELS = exports.THEMES = exports.PLATFORM_ZH = void 0;
exports.themeOf = themeOf;
exports.buildSheet = buildSheet;
exports.renderHtml = renderHtml;
exports.buildValueSheet = buildValueSheet;
exports.buildLadderSheet = buildLadderSheet;
const common_1 = require("./common");
Object.defineProperty(exports, "PLATFORM_ZH", { enumerable: true, get: function () { return common_1.PLATFORM_ZH; } });
const marble_1 = require("./marble");
const newspaper_1 = require("./newspaper");
const pixel_1 = require("./pixel");
exports.THEMES = {
    newspaper: newspaper_1.newspaperTheme,
    marble: marble_1.marbleTheme,
    pixel: pixel_1.pixelTheme,
};
exports.THEME_LABELS = {
    newspaper: '报纸（米黄·宋体·两栏）',
    marble: '大理石（象牙白·金线·单栏居中）',
    pixel: '极客像素（深色·等宽·ASCII 框线）',
};
function themeOf(key) {
    if (key === 'marble' || key === 'pixel' || key === 'newspaper')
        return exports.THEMES[key];
    return exports.THEMES.newspaper;
}
/** 把一个完整 digest 拆成「一个品类一张图」*/
function buildSheet(digest, category, categoryLabel, theme, width) {
    // 容错：老调用方可能没带 items（例如单测里的最小 digest）
    const source = digest.items?.length ? digest.items : [...(digest.movers ?? []), ...(digest.watch ?? [])];
    const items = (source ?? [])
        .filter((item) => item.category === category)
        .map((item) => ({
        modelId: item.modelId,
        name: item.name,
        price: item.price,
        change: item.change,
        d1: item.d1,
        pos: item.pos,
        label: item.label,
        grade: item.grade,
        modifier: item.modifier,
        confidence: item.confidence,
        offers: item.offers,
        trend: item.trend,
    }));
    const names = new Set(items.map((item) => item.name));
    return {
        digest,
        category,
        categoryLabel,
        items,
        movers: items.filter((item) => Math.abs(item.change) > 0.0005).slice(0, 5),
        compare: (digest.compare ?? [])
            .filter((cmp) => names.has(cmp.name))
            .slice(0, 4)
            .map((cmp) => ({
            name: cmp.name,
            offers: cmp.items.map((o) => ({ platform: o.platform, price: o.price ?? 0, shopName: o.shopName })),
            spread: cmp.spread,
            lowest: cmp.lowest,
        })),
        index: (() => {
            const found = digest.indexes.find((idx) => idx.category === category);
            return found ? { value: found.value, change: found.change, q30: found.q30, zone: found.zone } : undefined;
        })(),
        width,
        theme,
        title: digest.period.title,
        subtitle: `${digest.period.label}行情 · ${categoryLabel}`,
        mode: 'price',
    };
}
/** 整页 HTML（主题自己出样式，这里只负责骨架与字体兜底）*/
function renderHtml(sheet) {
    const theme = themeOf(sheet.theme);
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  html,body{height:auto}
  ${theme.css(sheet.width)}
</style></head>
<body>${theme.render(sheet)}</body></html>`;
}
/** 性价比榜：显卡比「性能/价格」，内存固态比「每 GB 价格」 */
function buildValueSheet(digest, category, rows, theme, width) {
    const sorted = [...rows].sort((a, b) => (a.higherIsBetter ? b.value - a.value : a.value - b.value));
    const label = `${CATEGORY_TEXT[category] ?? category}性价比榜`;
    return {
        digest,
        category,
        categoryLabel: CATEGORY_TEXT[category] ?? category,
        items: sorted.map((row, i) => ({
            modelId: row.name,
            name: row.name,
            // 主题里的 yuan() 吃的是「分」，这里统一换算，避免出现 ¥21 这种量级错误
            price: Math.round(row.price * 100),
            change: 0,
            d1: 0,
            pos: 0,
            label: '',
            grade: '',
            modifier: '',
            confidence: '',
            offers: [],
            trend: [],
            metric: {
                label: row.higherIsBetter ? '性能分' : '容量',
                value: row.higherIsBetter
                    ? `${row.metric} 分 · ${row.value.toFixed(1)} ${row.unit}`
                    : `${row.metric}G · ${row.value.toFixed(1)} ${row.unit}`,
                rank: i + 1,
            },
        })),
        movers: [],
        compare: [],
        index: undefined,
        width,
        theme,
        mode: 'value',
        title: label,
        subtitle: `${digest.period.label}行情 · 按性价比排序`,
    };
}
/** 显卡天梯图：按性能分从高到低 */
function buildLadderSheet(digest, rows, theme, width) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const top = sorted[0]?.score || 1;
    return {
        digest,
        category: 'gpu',
        categoryLabel: '显卡',
        items: sorted.map((row, i) => ({
            modelId: row.name,
            name: row.name,
            // 主题里的 yuan() 吃的是「分」，这里统一换算，避免出现 ¥21 这种量级错误
            price: Math.round(row.price * 100),
            change: 0,
            d1: 0,
            pos: row.score / top,
            label: '',
            grade: '',
            modifier: '',
            confidence: '',
            offers: [],
            trend: [],
            metric: { label: '性能分', value: `${row.score}`, bar: row.score / top, rank: i + 1 },
        })),
        movers: [],
        compare: [],
        index: undefined,
        width,
        theme,
        mode: 'ladder',
        title: '显卡性能天梯图',
        subtitle: '按 3DMark Time Spy 参考分排序',
    };
}
const CATEGORY_TEXT = { gpu: '显卡', ram: '内存', ssd: '固态' };
//# sourceMappingURL=index.js.map