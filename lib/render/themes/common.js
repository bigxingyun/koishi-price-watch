"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_ZH = exports.THEME_KEYS = void 0;
exports.esc = esc;
exports.yuan = yuan;
exports.pct = pct;
exports.arrow = arrow;
exports.trendClass = trendClass;
exports.sparkbars = sparkbars;
exports.THEME_KEYS = ['newspaper', 'marble', 'pixel'];
// ── 格式化工具（三套主题共用，避免各自实现出不一致） ──
function esc(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function yuan(cents) {
    return '¥' + (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function pct(value, digits = 1) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.00005)
        return '—';
    return (value > 0 ? '+' : '') + (value * 100).toFixed(digits) + '%';
}
function arrow(value) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.00005)
        return '·';
    return value > 0 ? '▲' : '▼';
}
function trendClass(value) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.00005)
        return 'flat';
    return value > 0 ? 'up' : 'down';
}
/** 极简 sparkline：用 div 高度画柱，不引入图表库 */
function sparkbars(points, height = 18) {
    if (points.length < 2)
        return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const step = Math.max(1, Math.floor(points.length / 16));
    const bars = [];
    for (let i = 0; i < points.length; i += step) {
        const h = Math.round(2 + ((points[i] - min) / span) * (height - 2));
        bars.push(`<i style="height:${h}px"></i>`);
    }
    return `<span class="spark">${bars.join('')}</span>`;
}
/** 平台名中文 */
exports.PLATFORM_ZH = {
    jd: '京东',
    taobao: '淘宝',
    pdd: '拼多多',
    manual: '人工',
    mock: '演示',
    tmall: '天猫',
};
//# sourceMappingURL=common.js.map