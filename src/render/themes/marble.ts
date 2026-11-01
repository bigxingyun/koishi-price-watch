import { arrow, esc, pct, PLATFORM_ZH, trendClass, yuan, type SheetModel, type Theme } from './common'

/**
 * 大理石主题（希腊古典美感）。
 *
 * 布局特征：**单栏居中 + 大留白 + 金色细线**。
 * 与报纸的两栏表格完全不同：这里每个型号是一枚居中的「铭牌」，
 * 用回纹（meander）分隔，序号用罗马数字，标题字距极宽。
 */
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', 'ⅩⅢ', 'ⅩⅣ', 'ⅩⅤ', 'ⅩⅥ', 'ⅩⅦ', 'ⅩⅧ', 'ⅩⅨ', 'ⅩⅩ']

function roman(index: number): string {
  return ROMAN[index] ?? String(index + 1)
}

export const marbleTheme: Theme = {
  key: 'marble',
  name: '大理石',
  tone: 'light',
  css: (width) => `
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${width}px;color:#2b2a27;
      font-family:"Georgia","Songti SC","Noto Serif CJK SC",serif;font-size:14px;line-height:1.7;
      /* 大理石纹理：三层低对比渐变 + 一层细噪点，全部纯 CSS，不引外部图 */
      background:
        radial-gradient(1200px 420px at 12% -6%, rgba(160,160,158,.30), transparent 62%),
        radial-gradient(900px 380px at 96% 8%, rgba(186,186,182,.26), transparent 60%),
        radial-gradient(700px 260px at 50% 104%, rgba(150,150,148,.22), transparent 66%),
        repeating-linear-gradient(118deg, rgba(210,208,202,.16) 0 2px, transparent 2px 9px),
        #faf8f4;
      padding:46px 56px 40px}
    .crest{text-align:center}
    .crest .kicker{font-size:10px;letter-spacing:9px;color:#8a7a5c;text-transform:uppercase}
    .crest h1{font-size:40px;font-weight:400;letter-spacing:14px;margin:12px 0 6px;color:#1f1e1b}
    .crest .rule{display:flex;align-items:center;justify-content:center;gap:14px;color:#b08d57;margin:14px 0}
    .crest .rule i{display:block;height:1px;width:150px;background:linear-gradient(90deg,transparent,#b08d57)}
    .crest .rule i:last-child{background:linear-gradient(90deg,#b08d57,transparent)}
    .crest .rule span{font-size:12px;letter-spacing:4px}
    .crest .date{font-size:11px;letter-spacing:5px;color:#8b8478}
    /* 回纹边框 */
    .meander{height:12px;margin:18px 0 6px;
      background:
        repeating-linear-gradient(90deg, transparent 0 6px, #b08d57 6px 7px, transparent 7px 14px),
        repeating-linear-gradient(0deg, transparent 0 5px, rgba(176,141,87,.55) 5px 6px, transparent 6px 11px);
      border-top:1px solid #d8c8a8;border-bottom:1px solid #d8c8a8}
    .intro{text-align:center;font-size:12.5px;color:#6d6558;letter-spacing:1px;margin:18px auto 6px;max-width:620px}
    .trio{display:flex;justify-content:center;gap:56px;margin:26px 0 8px;text-align:center}
    .trio div b{display:block;font-size:26px;font-weight:400;color:#1f1e1b;letter-spacing:1px}
    .trio div span{font-size:10px;letter-spacing:3px;color:#8a7a5c;text-transform:uppercase}
    .section{text-align:center;margin:34px 0 6px}
    .section h2{font-size:13px;font-weight:400;letter-spacing:8px;color:#7d6f52;text-transform:uppercase}
    .section .dash{width:60px;height:1px;background:#b08d57;margin:10px auto 0}
    .plaque{border-top:1px solid #e2d8c4;border-bottom:1px solid #e2d8c4;padding:16px 4px;margin-top:2px}
    .plaque .head{display:flex;align-items:baseline;gap:14px}
    .plaque .no{font-size:13px;color:#b08d57;letter-spacing:2px;min-width:34px}
    .plaque .nm{font-size:17px;letter-spacing:1px;flex:1}
    .plaque .px{font-family:"Georgia",serif;font-size:19px;letter-spacing:1px}
    .plaque .sub{display:flex;gap:22px;margin:8px 0 0 48px;font-size:11.5px;color:#736a5c;letter-spacing:1px;flex-wrap:wrap}
    .plaque .shop{color:#8a7a5c}
    .up{color:#9a3a2e}.down{color:#2f6b4a}.flat{color:#7a7364}
    .movers{margin-top:8px}
    .mv{display:flex;justify-content:space-between;gap:16px;padding:9px 4px;border-bottom:1px dotted #d9cfba;font-size:13px}
    .mv span:last-child{letter-spacing:1px}
    .cmp{padding:9px 4px;border-bottom:1px dotted #d9cfba;font-size:12.5px;text-align:center;letter-spacing:.5px}
    .bless{text-align:center;margin-top:38px;font-size:11px;letter-spacing:6px;color:#9c9182}
    .foot{display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;
      border-top:1px solid #e2d8c4;font-size:10px;letter-spacing:2px;color:#9c9182}
  `,
  render: (sheet) => {
    const d = sheet.digest
    const plaques = sheet.items.map((item, i) => {
      const shops = item.offers.map((o) => o.shopName).filter(Boolean).slice(0, 2)
      return `
      <div class="plaque">
        <div class="head">
          <span class="no">${roman(i)}</span>
          <span class="nm">${esc(item.name)}</span>
          <span class="px">${yuan(item.price)}</span>
        </div>
        <div class="sub">
          <span class="${trendClass(item.change)}">周期 ${arrow(item.change)}${pct(item.change)}</span>
          <span class="${trendClass(item.d1)}">单日 ${pct(item.d1)}</span>
          <span>区间位置 ${(item.pos * 100).toFixed(0)}%</span>
          <span>${esc(item.label)}</span>
          ${item.metric ? `<span>${item.metric.rank ? 'No.' + item.metric.rank + '　' : ''}${esc(item.metric.label)} ${esc(item.metric.value)}</span>` : ''}
          ${shops.length ? `<span class="shop">${esc(shops.join(' · '))}</span>` : ''}
        </div>
      </div>`
    }).join('')

    const movers = sheet.movers.map((item) => `
      <div class="mv"><span>${esc(item.name)}</span>
        <span class="${trendClass(item.change)}">${arrow(item.change)}${pct(item.change)}　${yuan(item.price)}</span></div>`).join('')

    const compare = sheet.compare.map((cmp) => `
      <div class="cmp"><b>${esc(cmp.name)}</b>　价差 ${pct(cmp.spread)}　
        ${cmp.offers.map((o) => `${PLATFORM_ZH[o.platform] ?? o.platform} ${yuan(o.price)}`).join('　·　')}</div>`).join('')

    return `
      <div class="crest">
        <div class="kicker">Hardware Price Chronicle</div>
        <h1>${esc(sheet.title)}</h1>
        <div class="rule"><i></i><span>${esc(sheet.categoryLabel)}</span><i></i></div>
        <div class="date">${esc(d.period.rangeText)}　·　${esc(d.period.platformLabel)}</div>
      </div>
      <div class="meander"></div>
      <div class="intro">
        ${esc(d.period.label)}行情，共录得 ${sheet.items.length} 个型号、${d.footer.quotes} 条报价。
        ${sheet.index ? `品类指数 ${sheet.index.value.toFixed(1)}（${sheet.index.zone}）` : ''}
      </div>
      <div class="trio">
        <div><b>${sheet.index ? sheet.index.value.toFixed(1) : '—'}</b><span>Index</span></div>
        <div><b>${sheet.index ? arrow(sheet.index.change) + pct(sheet.index.change) : '—'}</b><span>Change</span></div>
        <div><b>${d.health.ok}/${d.health.total}</b><span>Sources</span></div>
      </div>
      <div class="section"><h2>Market</h2><div class="dash"></div></div>
      ${plaques || '<div class="plaque">本品类暂无数据</div>'}
      <div class="section"><h2>Movement</h2><div class="dash"></div></div>
      <div class="movers">${movers || '<div class="mv"><span>没有明显异动</span><span>—</span></div>'}</div>
      ${compare ? `<div class="section"><h2>Comparison</h2><div class="dash"></div></div>${compare}` : ''}
      <div class="bless">·　·　·</div>
      <div class="foot">
        <span>价格以平台页面为准</span>
        <span>${esc(d.issue)}</span>
      </div>`
  },
}
