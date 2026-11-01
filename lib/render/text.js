"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderText = renderText;
const constants_1 = require("../constants");
const GRADE_TEXT = {
    S: '长线低点', A: '低位', B: '常态', C: '高位', D: '高位风险',
};
function pct(r) {
    if (Math.abs(r) < 0.0005)
        return '—';
    return `${r > 0 ? '▲' : '▼'}${(Math.abs(r) * 100).toFixed(1)}%`;
}
function itemLines(item, index) {
    const lines = [];
    const prefix = index ? `${index}. ` : '• ';
    lines.push(`${prefix}${item.name}  ${(0, constants_1.money)(item.price)}  ${pct(item.change)}`);
    const badge = `${item.grade} ${GRADE_TEXT[item.grade] ?? ''}`.trim();
    const extra = item.degrade ? item.degrade.detail : `置信度${item.confidence}`;
    lines.push(`   30日 ${badge} ${item.modifier} · ${extra}${!item.degrade && Math.abs(item.streak) >= 2 ? ` · 连${item.streak > 0 ? '涨' : '跌'}${Math.abs(item.streak)}日` : ''}`);
    if (item.offers.length) {
        const prices = item.offers.filter((o) => o.price !== null);
        const min = prices.length ? Math.min(...prices.map((o) => o.price)) : NaN;
        lines.push('   ' + item.offers.map((o) => (o.price === null
            ? `${o.label} 缺货`
            : `${o.label} ${o.price === min && prices.length > 1 ? `[${(0, constants_1.moneyPlain)(o.price)}]` : (0, constants_1.moneyPlain)(o.price)}`)).join(' / '));
    }
    return lines;
}
/**
 * 纯文本渲染：全平台兜底形态。
 * 超长时按「比价 → 我的关注 → 异动」的顺序逐段裁剪，保证结构完整。
 */
function renderText(model, limit = 1800) {
    const head = [
        `${model.period.title}${model.period.platform === 'all' ? '' : `（${model.period.platformLabel}）`} ${model.period.rangeText}`,
        `采集 ${model.health.ok}/${model.health.total}${model.health.failed ? ` · 失败 ${model.health.failed}` : ''}`,
    ];
    const indexSection = model.indexes.length
        ? ['', `【品类指数·${model.period.changeLabel}】`, ...model.indexes.map((i) => `${i.label.padEnd(3, '　')} ${i.value.toFixed(1).padStart(6)}  ${pct(i.change).padStart(7)}  分位${(i.q30 * 100).toFixed(0)}%  ${i.zone}`)]
        : [];
    const moverSection = [
        '', `【${model.period.changeLabel}异动 Top${model.movers.length}】`,
        ...model.movers.flatMap((item, i) => itemLines(item, i + 1)),
    ];
    const compareSection = model.compare.length
        ? ['', '【比价机会】', ...model.compare.map((c) => `• ${c.name}  ${c.items.map((o) => `${o.label}${o.price === null ? '缺货' : (0, constants_1.moneyPlain)(o.price)}`).join(' / ')} → 价差 ${(c.spread * 100).toFixed(1)}%，${c.lowest}最低`)]
        : [];
    const watchSection = model.watch.length
        ? ['', '【我的关注】', ...model.watch.map((item) => `• ${item.name}  ${(0, constants_1.money)(item.price)}  ${pct(item.change)}  ${item.degrade ? item.degrade.detail : (GRADE_TEXT[item.grade] ?? '')}`)]
        : [];
    const tail = ['', `数据 ${model.footer.quotes} 条 · 型号 ${model.footer.models} · ${(model.footer.costMs / 1000).toFixed(1)}s`];
    const blocks = [head.join('\n'), indexSection.join('\n'), moverSection.join('\n'), compareSection.join('\n'), watchSection.join('\n'), tail.join('\n')];
    // 依次丢弃：比价、关注、异动尾部
    const order = [0, 1, 2, 3, 4, 5];
    let text = order.map((i) => blocks[i]).filter(Boolean).join('\n');
    if (text.length <= limit)
        return text;
    for (const drop of [3, 4]) {
        blocks[drop] = '';
        text = blocks.filter(Boolean).join('\n');
        if (text.length <= limit)
            return text;
    }
    while (text.length > limit && blocks[2]) {
        const lines = blocks[2].split('\n');
        if (lines.length <= 3)
            break;
        lines.splice(-3, 3);
        blocks[2] = lines.join('\n');
        text = blocks.filter(Boolean).join('\n');
    }
    return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}
//# sourceMappingURL=text.js.map