"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pixelTheme = void 0;
const common_1 = require("./common");
/**
 * 极客像素主题。
 *
 * 布局特征：**全 ASCII 框线 + 等宽字体 + 高对比深色**，行内用 `│` `├─┤` 分隔，
 * 涨跌用方块进度条而不是数字对齐。跟报纸/大理石在结构上都不是一套东西：
 * 没有居中标题，没有细线分区，一切靠字符网格。
 *
 * 说明：真像素字体（如 Zpix / Unifont）需要字体文件，这里优先使用系统里可能存在的
 * 像素字体，找不到就退到等宽字体 —— 布局本身已经是终端风格，视觉差异不受影响。
 */
exports.pixelTheme = {
    key: 'pixel',
    name: '极客像素',
    tone: 'dark',
    css: (width) => `
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${width}px;background:#080b10;color:#c8f7d4;
      font-family:"Zpix","Fusion Pixel 12px Monospaced","Unifont","Cascadia Mono","Consolas","Courier New",monospace;
      font-size:13px;line-height:1.5;padding:18px 18px 14px;
      /* 扫描线：每 3px 一条极淡的暗线，像素屏质感 */
      background-image:repeating-linear-gradient(0deg, rgba(0,255,170,.035) 0 1px, transparent 1px 3px)}
    .bar{display:flex;justify-content:space-between;align-items:center;
      border:2px solid #1f6b52;background:#0b1410;padding:6px 10px;letter-spacing:1px}
    .bar b{color:#7ef29b;font-weight:700}
    .bar .dim{color:#4f7a68}
    .title{text-align:left;margin:12px 0 8px;letter-spacing:2px}
    .title h1{font-size:22px;color:#8bf7c0;letter-spacing:3px;text-transform:uppercase}
    .title h1:before{content:"▚ ";color:#59d1ff}
    .title .sub{font-size:11px;color:#4f7a68;letter-spacing:1px;margin-top:4px}
    .box{border:2px solid #1f6b52;margin-top:10px}
    .box>.hd{background:#0f1d17;border-bottom:2px solid #1f6b52;padding:5px 10px;
      color:#59d1ff;letter-spacing:2px;font-size:12px}
    .box>.hd:before{content:"[ "}
    .box>.hd:after{content:" ]"}
    .row{display:grid;grid-template-columns:34px 1fr 96px 84px 64px;gap:8px;
      padding:6px 10px;border-bottom:1px dashed #14382c;align-items:baseline}
    .row:last-child{border-bottom:none}
    .row .no{color:#3f6a58}
    .row .nm{color:#d9ffe8;letter-spacing:.5px;word-break:break-word}
    .row .nm .shop{display:block;color:#4f7a68;font-size:11px;letter-spacing:0}
    .row .px{color:#ffe066;text-align:right;white-space:nowrap}
    .row .ch{text-align:right;white-space:nowrap}
    .row .d1{text-align:right;white-space:nowrap;font-size:11px}
    .up{color:#ff5d5d}.down{color:#5dff9e}.flat{color:#6d8b7f}
    .hdr{display:grid;grid-template-columns:34px 1fr 96px 84px 64px;gap:8px;
      padding:4px 10px;color:#4f7a68;font-size:10px;letter-spacing:2px;border-bottom:2px solid #1f6b52}
    .meter{color:#59d1ff;letter-spacing:-1px}
    .faq{display:flex;gap:18px;padding:8px 10px;border-bottom:1px dashed #14382c;font-size:12px}
    .faq:last-child{border-bottom:none}
    .faq .q{flex:1;color:#d9ffe8;word-break:break-word}
    .faq .v{color:#ffe066;white-space:nowrap}
    .cmp{padding:8px 10px;border-bottom:1px dashed #14382c;font-size:12px;
      display:flex;flex-wrap:wrap;gap:14px}
    .cmp .k{color:#8bf7c0}
    .cmp .s{color:#4f7a68}
    .prompt{border:2px solid #1f6b52;padding:8px 10px;margin-top:10px;
      color:#7ef29b;font-size:12px;letter-spacing:1px;background:#0b1410}
    .prompt:before{content:"> ";color:#59d1ff}
    .foot{display:flex;justify-content:space-between;margin-top:10px;font-size:10px;
      color:#3f6a58;letter-spacing:1px;border-top:2px solid #14382c;padding-top:8px}
    .stamp{color:#ff5d5d}
  `,
    render: (sheet) => {
        const d = sheet.digest;
        const rows = sheet.items.map((item, i) => {
            const shops = item.offers.map((o) => o.shopName).filter(Boolean).slice(0, 1);
            return `
      <div class="row">
        <span class="no">${String(i + 1).padStart(2, '0')}</span>
        <span class="nm">${(0, common_1.esc)(item.name)}${shops.length ? `<span class="shop">@${(0, common_1.esc)(shops[0])}</span>` : ''}${item.metric ? `<span class="shop">${item.metric.rank ? '#' + item.metric.rank + ' ' : ''}${(0, common_1.esc)(item.metric.label)}=${(0, common_1.esc)(item.metric.value)}</span>` : ''}</span>
        <span class="px">${(0, common_1.yuan)(item.price)}</span>
        <span class="ch ${(0, common_1.trendClass)(item.change)}">${(0, common_1.arrow)(item.change)}${(0, common_1.pct)(item.change)}</span>
        <span class="d1 ${(0, common_1.trendClass)(item.d1)}">${(0, common_1.pct)(item.d1)}</span>
      </div>`;
        }).join('');
        const movers = sheet.movers.map((item) => `
      <div class="faq">
        <span class="q">${(0, common_1.esc)(item.name)}</span>
        <span class="meter">${meter(item.pos)}</span>
        <span class="v ${(0, common_1.trendClass)(item.change)}">${(0, common_1.arrow)(item.change)}${(0, common_1.pct)(item.change)}</span>
      </div>`).join('');
        const compare = sheet.compare.map((cmp) => `
      <div class="cmp">
        <span class="k">${(0, common_1.esc)(cmp.name)}</span>
        ${cmp.offers.map((o) => `<span>${common_1.PLATFORM_ZH[o.platform] ?? o.platform}=${(0, common_1.yuan)(o.price)}</span>`).join('')}
        <span class="s">spread=${(0, common_1.pct)(cmp.spread)}</span>
      </div>`).join('');
        return `
      <div class="bar">
        <b>PRICE-WATCH</b>
        <span class="dim">${(0, common_1.esc)(d.period.rangeText)}</span>
        <span class="dim">${(0, common_1.esc)(d.period.platformLabel)}</span>
      </div>
      <div class="title">
        <h1>${(0, common_1.esc)(sheet.title)}</h1>
        <div class="sub">// ${(0, common_1.esc)(sheet.subtitle)} :: ${(0, common_1.esc)(sheet.categoryLabel)} :: ${(0, common_1.esc)(d.dateText)}</div>
      </div>
      <div class="box">
        <div class="hd">SNAPSHOT</div>
        <div class="faq"><span class="q">INDEX ${sheet.index ? sheet.index.value.toFixed(1) : '--'}　${sheet.index ? sheet.index.zone : ''}</span>
          <span class="v">${sheet.index ? (0, common_1.arrow)(sheet.index.change) + (0, common_1.pct)(sheet.index.change) : '--'}</span></div>
        <div class="faq"><span class="q">MODELS ${sheet.items.length}　QUOTES ${d.footer.quotes}</span>
          <span class="v">${d.health.ok}/${d.health.total} OK</span></div>
      </div>
      <div class="box">
        <div class="hd">${(0, common_1.esc)(sheet.categoryLabel)} / ${(0, common_1.esc)(d.period.changeLabel)}</div>
        <div class="hdr"><span>NO</span><span>MODEL</span><span>PRICE</span><span>CHG</span><span>D1</span></div>
        ${rows || '<div class="row"><span class="no">--</span><span class="nm">NO DATA</span><span></span><span></span><span></span></div>'}
      </div>
      <div class="box">
        <div class="hd">MOVERS</div>
        ${movers || '<div class="faq"><span class="q">NO SIGNIFICANT MOVE</span></div>'}
      </div>
      ${compare ? `<div class="box"><div class="hd">SPREAD</div>${compare}</div>` : ''}
      <div class="prompt">report generated · ${(0, common_1.esc)(d.dateText)} · ${(0, common_1.esc)(d.issue)}</div>
      <div class="foot">
        <span>prices are for reference only</span>
        <span class="stamp">${d.footer.costMs}ms</span>
      </div>`;
    },
};
/** 用方块画区间位置（0~1），像素风的进度条 */
function meter(pos, width = 10) {
    const filled = Math.max(0, Math.min(width, Math.round(pos * width)));
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}
//# sourceMappingURL=pixel.js.map