"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderHtml = renderHtml;
/**
 * 报纸风格 HTML 模板。
 *
 * 设计约束（与样张 mockups/report-v3.html 一致）：
 * - 零外部资源：不引 CDN、不引字体文件，全部内联 CSS + 内联 SVG
 * - 图表手写 SVG：不依赖 canvas / 图表库，截图时无需等待异步绘制
 * - 不用 emoji：Linux 容器常缺 emoji 字体，会渲染成方块
 * - 涨跌只用「点色」（暗红 / 墨绿），不做彩色图表
 */
const constants_1 = require("../constants");
const GRADE_TEXT = {
    S: '长线低点',
    A: '低位',
    B: '常态',
    C: '高位',
    D: '高位风险',
};
const PALETTE = {
    cn: { up: '#9d1f1b', down: '#1d5e34' },
    intl: { up: '#1d5e34', down: '#9d1f1b' },
};
function esc(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function pctText(r) {
    const v = Math.abs(r * 100).toFixed(1);
    if (Math.abs(r) < 0.0005)
        return '—';
    return `${r > 0 ? '▲' : '▼'}${v}%`;
}
function signed(r) {
    const v = (Math.abs(r) * 100).toFixed(1);
    const dir = r > 0 ? '上' : '下';
    return `${dir} ${v}%`;
}
const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "SimSun", "Songti SC", "Noto Serif CJK SC", serif; color: #14120e; -webkit-font-smoothing: antialiased; }
.page {
  padding: 32px 42px 26px;
  background: radial-gradient(ellipse at 18% 4%, rgba(120,100,60,.06), transparent 55%),
              radial-gradient(ellipse at 84% 94%, rgba(120,100,60,.055), transparent 50%),
              #f6f1e3;
  font-size: 13.5px; line-height: 1.75;
}
.masthead { border-top: 3px solid #14120e; padding: 9px 0 0; }
.kicker { font-family: "SimHei", "Heiti SC", "Noto Sans CJK SC", sans-serif; font-size: 9.5px; letter-spacing: 5px; color: #6a6252; text-align: center; }
h1 { font-size: 52px; line-height: 1.14; letter-spacing: 7px; font-weight: 700; text-align: center; margin: 5px 0 1px; }
.en { font-family: Georgia, "Times New Roman", serif; font-size: 10px; letter-spacing: 6.5px; color: #6a6252; text-align: center; margin-bottom: 8px; }
.meta { display: flex; justify-content: space-between; align-items: center; border-top: 3px double #14120e; padding: 5px 2px 6px; font-size: 11px; color: #3c372d; letter-spacing: .6px; }
.meta .mid { letter-spacing: 2.5px; }
.contents { display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #b9b09a; padding: 6px 0 7px; font-size: 11.5px; color: #3c372d; }
.contents .label { font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-size: 10px; letter-spacing: 3px; color: #9d1f1b; padding-right: 14px; }
.contents .item { padding: 0 14px; border-left: 1px solid #c7bfab; }
.lead { padding: 15px 0 13px; border-bottom: 1px solid #14120e; }
.lead p { font-size: 14.5px; line-height: 1.94; text-align: justify; }
.dateline { font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-size: 11.5px; letter-spacing: 2px; color: #9d1f1b; margin-right: 6px; }
.up { color: #9d1f1b; }
.down { color: #1d5e34; }
.flat { color: #5c5546; }
.out { color: #8a8271; }
.cols { display: grid; grid-template-columns: 318px 1fr; gap: 0 22px; padding-top: 14px; }
.cols .right { border-left: 1px solid #b9b09a; padding-left: 22px; }
.sec { display: flex; align-items: center; gap: 9px; font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-size: 11.5px; font-weight: normal; letter-spacing: 3.5px; color: #14120e; margin-bottom: 9px; }
.sec::before, .sec::after { content: ""; flex: 1; height: 1px; background: #14120e; }
.sec.sub { margin-top: 20px; }
.secnote { font-size: 10.5px; color: #6a6252; margin: -5px 0 8px; letter-spacing: .3px; }
table { border-collapse: collapse; }
table.idx { width: 100%; font-size: 12.5px; }
table.idx th { font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-weight: normal; font-size: 10px; letter-spacing: 1.2px; color: #6a6252; text-align: right; padding: 0 0 4px; border-bottom: 1px solid #14120e; }
table.idx th:first-child { text-align: left; }
table.idx td { padding: 6px 0 5px; border-bottom: 1px dotted #c7bfab; text-align: right; }
table.idx td:first-child { text-align: left; font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-size: 12.5px; letter-spacing: 1px; }
table.idx tr:last-child td { border-bottom: none; }
table.idx th:last-child, table.idx td:last-child { padding-left: 8px; }
table.idx.watch td { padding: 5px 0; }
table.idx.watch td:first-child { font-size: 12px; letter-spacing: .3px; }
.num { font-family: Georgia, "Times New Roman", serif; font-variant-numeric: lining-nums tabular-nums; font-feature-settings: "lnum" 1, "tnum" 1; letter-spacing: .2px; }
.num.big { font-size: 14.5px; font-weight: 700; }
.tag { font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-size: 10.5px; letter-spacing: 1px; }
.note { font-size: 10.5px; color: #6a6252; line-height: 1.68; margin-top: 7px; text-align: justify; }
.bars { margin-top: 2px; }
.bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; font-size: 11.5px; }
.bar-row .bl { font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-size: 11px; letter-spacing: 1px; width: 30px; }
.btrack { position: relative; flex: 1; height: 9px; background: #e7e0cd; }
.btrack::after { content: ""; position: absolute; left: 50%; top: -2.5px; bottom: -2.5px; width: 1px; background: #6f6754; }
.bfill { position: absolute; top: 0; height: 100%; min-width: 3px; }
.bar-row .bv { width: 54px; text-align: right; font-size: 11.5px; }
.mover { padding-bottom: 11px; margin-bottom: 11px; border-bottom: 1px dotted #c7bfab; }
.mover:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.mover .top { display: flex; align-items: baseline; gap: 7px; }
.mover .no { font-family: Georgia, serif; font-size: 11.5px; color: #9d1f1b; font-weight: 700; width: 11px; }
.mover .name { font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-size: 14.5px; font-weight: normal; letter-spacing: .8px; }
.mover .price { margin-left: auto; font-size: 16.5px; font-weight: 700; }
.mover .chg { font-size: 12.5px; width: 54px; text-align: right; padding-left: 8px; }
.mover .sub { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 11.5px; color: #3c372d; flex-wrap: wrap; }
.mover .sub .dot { color: #b9b09a; }
.badge { display: inline-block; border: 1px solid #14120e; padding: 0 3.5px; font-family: Georgia, serif; font-size: 10.5px; line-height: 1.45; font-weight: 700; }
.badge.s { background: #14120e; color: #f6f1e3; }
.mover .offers { font-size: 11.5px; color: #3c372d; margin-top: 1px; }
.mover .offers .low { font-weight: 700; text-decoration: underline; text-underline-offset: 2.5px; }
.mover .chart { display: flex; justify-content: flex-end; margin-top: 3px; }
.spark { display: block; }
.cmp { margin-top: 15px; padding-top: 12px; border-top: 1px solid #14120e; }
table.cmp { width: 100%; font-size: 12px; }
table.cmp th { font-family: "SimHei", "Noto Sans CJK SC", sans-serif; font-weight: normal; font-size: 10px; letter-spacing: 1.2px; color: #6a6252; text-align: right; padding-bottom: 4px; border-bottom: 1px solid #14120e; }
table.cmp th:first-child { text-align: left; }
table.cmp td { padding: 5px 0; border-bottom: 1px dotted #c7bfab; text-align: right; }
table.cmp td:first-child { text-align: left; font-family: "SimHei", "Noto Sans CJK SC", sans-serif; letter-spacing: .8px; }
table.cmp tr:last-child td { border-bottom: none; }
table.cmp .win { font-weight: 700; text-decoration: underline; text-underline-offset: 2.5px; }
footer { margin-top: 13px; border-top: 3px double #14120e; padding-top: 7px; font-size: 10px; color: #6a6252; line-height: 1.7; display: flex; justify-content: space-between; gap: 24px; }
footer > div:first-child { text-align: justify; }
footer .right-col { text-align: right; white-space: nowrap; }
`;
function renderHtml(model, options) {
    const palette = PALETTE[model.colorScheme] ?? PALETTE.cn;
    const tone = (r) => {
        if (Math.abs(r) < 0.0005)
            return 'flat';
        const growing = r > 0;
        const redIsUp = model.colorScheme !== 'intl';
        return growing === redIsUp ? 'up' : 'down';
    };
    const dotColor = (r) => {
        if (Math.abs(r) < 0.0005)
            return '#8a8271';
        const growing = r > 0;
        const redIsUp = model.colorScheme !== 'intl';
        return growing === redIsUp ? palette.up : palette.down;
    };
    const spark = (values, r, w = 132, h = 26) => {
        if (values.length < 2)
            return '';
        const pad = 2.5;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const rng = max - min || 1;
        const pts = values.map((v, i) => [
            pad + (i * (w - 2 * pad)) / (values.length - 1),
            h - pad - ((v - min) / rng) * (h - 2 * pad),
        ]);
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        const last = pts[pts.length - 1];
        const area = `${d} L${last[0].toFixed(1)} ${h - 1} L${pts[0][0].toFixed(1)} ${h - 1} Z`;
        return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
            + `<path d="${area}" fill="rgba(20,18,14,.07)" stroke="none"/>`
            + `<path d="${d}" fill="none" stroke="#14120e" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"/>`
            + `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2" fill="${dotColor(r)}"/>`
            + `</svg>`;
    };
    const offersLine = (offers) => {
        if (!offers.length)
            return '<span class="out">暂无平台报价</span>';
        const prices = offers.filter((o) => o.price !== null);
        const min = prices.length ? Math.min(...prices.map((o) => o.price)) : NaN;
        return offers
            .map((o) => (o.price === null
            ? `${esc(o.label)} <span class="out">缺货</span>`
            : `${esc(o.label)} ${o.price === min && prices.length > 1
                ? `<span class="low">${(0, constants_1.moneyPlain)(o.price)}</span>`
                : (0, constants_1.moneyPlain)(o.price)}`))
            .join('　');
    };
    const indexRows = model.indexes.map((idx) => `<tr>
        <td>${esc(idx.label)}</td>
        <td class="num big">${idx.value.toFixed(1)}</td>
        <td class="num ${tone(idx.change)}">${pctText(idx.change)}</td>
        <td class="num">${(idx.q30 * 100).toFixed(0)}%</td>
        <td class="tag">${esc(idx.zone)}</td>
      </tr>`).join('');
    const barRows = model.indexes.map((idx) => {
        const width = Math.min(50, (Math.abs(idx.r30) / 0.1) * 50);
        const side = idx.r30 >= 0 ? 'pos' : 'neg';
        const color = idx.r30 >= 0 ? palette.up : palette.down;
        return `<div class="bar-row">
          <span class="bl">${esc(idx.label)}</span>
          <div class="btrack"><div class="bfill ${side}" style="width:${width.toFixed(1)}%;background:${color}"></div></div>
          <span class="bv num ${tone(idx.r30)}">${idx.r30 >= 0 ? '+' : '−'}${(Math.abs(idx.r30) * 100).toFixed(1)}%</span>
        </div>`;
    }).join('');
    const watchRows = model.watch.length
        ? model.watch.map((item) => {
            const tag = item.degrade ? item.degrade.detail : (GRADE_TEXT[item.grade] ?? item.grade);
            const tagClass = item.degrade ? 'tag out' : 'tag';
            return `<tr>
            <td>${esc(item.name)}</td>
            <td class="num">${(0, constants_1.money)(item.price)}</td>
            <td class="num ${tone(item.change)}">${pctText(item.change)}</td>
            <td class="${tagClass}">${esc(tag)}</td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="4" class="out">尚未订阅型号（price watch add）</td></tr>';
    const movers = model.movers.map((item, i) => {
        const badges = [
            `<span class="badge ${item.grade === 'S' ? 's' : ''}">${esc(item.grade)}</span>`,
            `<span>${esc(GRADE_TEXT[item.grade] ?? '')}</span>`,
            `<span class="dot">·</span><span class="num">${esc(item.modifier)}</span>`,
            `<span class="dot">·</span><span>置信度${esc(item.confidence)}</span>`,
        ];
        if (item.degrade) {
            badges.push(`<span class="dot">·</span><span class="out">${esc(item.degrade.detail)}</span>`);
        }
        else if (Math.abs(item.streak) >= 2) {
            badges.push(`<span class="dot">·</span><span>连${item.streak > 0 ? '涨' : '跌'} ${Math.abs(item.streak)} 日</span>`);
        }
        return `<article class="mover">
        <div class="top">
          <span class="no">${i + 1}</span>
          <span class="name">${esc(item.name)}</span>
          <span class="price num">${(0, constants_1.money)(item.price)}</span>
          <span class="chg num ${tone(item.change)}">${pctText(item.change)}</span>
        </div>
        <div class="sub">${badges.join('')}</div>
        <div class="offers">${offersLine(item.offers)}</div>
        <div class="chart">${spark(item.trend, item.change)}</div>
      </article>`;
    }).join('');
    const compareSection = model.compare.length
        ? `<section class="cmp">
    <h2 class="sec">比价机会</h2>
    <table class="cmp">
      <thead><tr><th>型号</th><th>京东</th><th>淘宝</th><th>拼多多</th><th>价差</th><th>结论</th></tr></thead>
      <tbody>${model.compare.map((row) => {
            const prices = row.items.filter((o) => o.price !== null);
            const min = Math.min(...prices.map((o) => o.price));
            const max = Math.max(...prices.map((o) => o.price));
            const cell = (platform) => {
                const offer = row.items.find((o) => o.platform === platform);
                if (!offer || offer.price === null)
                    return '<td class="num out">—</td>';
                const win = offer.price === min ? ' win' : '';
                return `<td class="num${win}">${(0, constants_1.money)(offer.price)}</td>`;
            };
            return `<tr>
          <td>${esc(row.name)}</td>
          ${cell('jd')}${cell('taobao')}${cell('pdd')}
          <td class="num">${(row.spread * 100).toFixed(1)}%</td>
          <td>${esc(row.lowest)}最低${max > min ? `，可省 ${(0, constants_1.money)(max - min)}` : ''}</td>
        </tr>`;
        }).join('')}</tbody>
    </table>
  </section>`
        : '';
    const healthNote = model.health.failed > 0 ? `　失败 ${model.health.failed}（平台风控冷却中）` : '';
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${model.period.title} ${model.day}</title>
<style>${CSS}
.page { width: ${options.width}px; }
</style></head>
<body><div class="page">

  <header class="masthead">
    <div class="kicker">显 卡 · 内 存 · 固 态 硬 盘　·　${esc(model.period.platformLabel)}</div>
    <h1>${esc(model.period.title)}</h1>
    <div class="en">HARDWARE PRICE DAILY</div>
    <div class="meta">
      <span>${esc(model.issue || '第 001 期')}</span>
      <span class="mid">${esc(model.period.rangeText)}</span>
      <span>采集 ${model.health.ok} / ${model.health.total}${healthNote}</span>
    </div>
  </header>

  <div class="contents">
    <span class="label">本期要目</span>
    ${buildContents(model).map((t) => `<span class="item">${esc(t)}</span>`).join('')}
  </div>

  <section class="lead">
    <p><span class="dateline">本报讯</span>${buildLead(model, tone)}</p>
  </section>

  <div class="cols">
    <div class="left">
      <h2 class="sec">市场行情</h2>
      <table class="idx">
        <thead><tr><th>品类</th><th>指数</th><th>${esc(model.period.changeLabel)}</th><th>分位</th><th>区间</th></tr></thead>
        <tbody>${indexRows}</tbody>
      </table>
      <p class="note">指数以入指数型号的首采价为基期（100），取等权几何平均，逐日链式衔接。</p>

      <h2 class="sec sub">距三十日均价</h2>
      <div class="bars">${barRows}</div>
      <p class="note">条形为现价相对三十日均价的偏离，中线即均价。</p>

      <h2 class="sec sub">我的关注</h2>
      <table class="idx watch"><tbody>${watchRows}</tbody></table>
    </div>

    <div class="right">
      <h2 class="sec">${esc(model.period.changeLabel)}异动</h2>
      <p class="secnote">按${esc(model.period.changeLabel)}涨跌幅绝对值排序，仅列前五。</p>
      ${movers || '<p class="out">暂无足够数据</p>'}
    </div>
  </div>

  ${compareSection}

  <footer>
    <div>数据来源：京东、淘宝、拼多多商品详情页，每日采集并存入本地数据库；指数与评级为规则计算结果，仅供参考，不构成购买建议。</div>
    <div class="right-col">
      本期 ${model.footer.models} 型号 / ${model.footer.quotes} 条报价<br>
      ${(0, constants_1.formatDay)(model.day)} · 渲染 ${(model.footer.costMs / 1000).toFixed(1)} s
    </div>
  </footer>

</div></body></html>`;
}
function buildContents(model) {
    const items = [];
    const top = model.movers[0];
    if (top)
        items.push(`${top.name} ${pctText(top.change)}`);
    const strongest = [...model.indexes].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    if (strongest)
        items.push(`${strongest.label}指数${strongest.change >= 0 ? '上行' : '回落'} ${(Math.abs(strongest.change) * 100).toFixed(1)}%`);
    const cmp = model.compare[0];
    if (cmp)
        items.push(`${cmp.name} 跨平台价差 ${(cmp.spread * 100).toFixed(1)}%`);
    else
        items.push('本期未见显著跨平台价差');
    return items.slice(0, 3);
}
function buildLead(model, tone) {
    if (!model.indexes.length)
        return '本期尚无足够数据形成结论。';
    // 日报说「较昨日」，周报说「较本周初」，月报说「较本月初」
    const basis = model.period.kind === 'daily' ? '昨日'
        : model.period.kind === 'weekly' ? '本周初' : '本月初';
    const parts = model.indexes.map((idx) => {
        const dir = idx.change >= 0 ? '上' : '下';
        const pct = (Math.abs(idx.change) * 100).toFixed(1);
        const zone = idx.q30 <= 0.35 ? '低位区间' : idx.q30 >= 0.65 ? '高位区间' : '常规区间';
        return `${esc(idx.label)}指数收于 <b>${idx.value.toFixed(1)}</b>，较${basis}往${dir} <b class="${tone(idx.change)}">${pct}%</b>，落至近三十日分位 <b>${(idx.q30 * 100).toFixed(0)}%</b> 的${zone}`;
    });
    const tail = `本期共采集 <b>${model.health.ok}</b> 条有效报价，覆盖 <b>${model.footer.models}</b> 个型号${model.health.failed > 0 ? `，另有 <b>${model.health.failed}</b> 条因风控冷却暂缺` : ''}。`;
    return parts.join('；') + '。' + tail;
}
//# sourceMappingURL=html.js.map