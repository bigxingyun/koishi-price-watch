import { arrow, esc, pct, PLATFORM_ZH, sparkbars, trendClass, yuan, type SheetModel, type Theme } from './common'

/**
 * 报纸主题。
 *
 * 布局特征：居中报头 + 双细线 + 左栏「品类指数」+ 右侧两栏表格。
 * 一切靠细线和留白分区，不用色块 —— 这是跟另外两套最直观的区别。
 */
export const newspaperTheme: Theme = {
  key: 'newspaper',
  name: '报纸',
  tone: 'paper',
  css: (width) => `
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${width}px;background:#f4eddc;color:#1c1a17;
      font-family:"Songti SC","SimSun","Noto Serif CJK SC",serif;
      padding:26px 30px 20px;font-size:14px;line-height:1.55}
    .masthead{text-align:center;border-bottom:3px double #1c1a17;padding-bottom:10px}
    .masthead h1{font-size:44px;letter-spacing:10px;font-weight:900}
    .masthead .en{font-size:10px;letter-spacing:5px;color:#6b6459;margin-top:4px}
    .meta{display:flex;justify-content:space-between;font-size:11px;color:#5a5348;
      border-bottom:1px solid #1c1a17;padding:6px 2px;letter-spacing:.5px}
    .lead{display:grid;grid-template-columns:1fr 2.1fr;gap:18px;margin-top:14px}
    .rail{border-right:1px solid #c9bfa8;padding-right:14px}
    .rail h3,.sec h3{font-size:12px;letter-spacing:3px;border-bottom:1px solid #1c1a17;
      padding-bottom:3px;margin-bottom:8px;font-weight:700}
    .index{font-size:34px;font-weight:900;letter-spacing:1px}
    .index small{display:block;font-size:11px;color:#6b6459;letter-spacing:1px;font-weight:400}
    .kv{display:flex;justify-content:space-between;font-size:12px;border-bottom:1px dotted #c9bfa8;padding:4px 0}
    .table{width:100%;border-collapse:collapse}
    .table th{font-size:10px;letter-spacing:1px;color:#6b6459;text-align:left;
      border-bottom:1px solid #1c1a17;padding:4px 2px;font-weight:400}
    .table td{padding:5px 2px;border-bottom:1px dotted #c9bfa8;vertical-align:top}
    .nm{font-weight:700}
    .shop{font-size:10px;color:#7a7266;letter-spacing:.3px}
    .metric{display:block;font-size:10.5px;color:#8a6d3b;letter-spacing:.5px}
    .px{font-family:Consolas,"Courier New",monospace;font-weight:700;white-space:nowrap}
    .up{color:#a8322a}.down{color:#1f6b3a}.flat{color:#6b6459}
    .spark i{display:inline-block;width:3px;background:#9a8f7c;margin-right:1px;vertical-align:bottom}
    .two{column-count:2;column-gap:20px;column-rule:1px solid #e0d6c0}
    .two .row{break-inside:avoid;border-bottom:1px dotted #c9bfa8;padding:5px 0;font-size:12.5px}
    .row .top{display:flex;justify-content:space-between;gap:8px}
    .sec{margin-top:16px;border-top:2px solid #1c1a17;padding-top:10px}
    .cmp{font-size:12px;border-bottom:1px dotted #c9bfa8;padding:5px 0}
    .foot{margin-top:16px;border-top:3px double #1c1a17;padding-top:8px;
      font-size:10px;color:#6b6459;display:flex;justify-content:space-between;letter-spacing:.5px}
  `,
  render: (sheet) => {
    const d = sheet.digest
    const rows = sheet.items.map((item) => `
      <tr>
        <td class="nm">${esc(item.name)}${item.metric ? `<span class="metric">${item.metric.rank ? item.metric.rank + '. ' : ''}${esc(item.metric.label)} ${esc(item.metric.value)}</span>` : `<span class="shop">${esc(shopOf(item))}</span>`}</td>
        <td class="px">${yuan(item.price)}</td>
        ${sheet.mode === 'price'
          ? `<td class="${trendClass(item.change)}">${arrow(item.change)}${pct(item.change)}</td>
             <td class="${trendClass(item.d1)}">${pct(item.d1)}</td>
             <td>${sparkbars(item.trend)}</td>`
          : `<td colspan="3" style="font-size:11px;color:#7a7266">${item.metric ? esc(item.metric.label) : ''} ${item.metric ? esc(item.metric.value) : ''}</td>`}
      </tr>`).join('')

    const movers = sheet.movers.map((item) => `
      <div class="row">
        <div class="top"><span>${esc(item.name)}</span>
          <span class="${trendClass(item.change)}">${arrow(item.change)}${pct(item.change)}</span></div>
        <div class="shop">${esc(shopOf(item))}　${yuan(item.price)}　${esc(item.label)}</div>
      </div>`).join('')

    const compare = sheet.compare.map((cmp) => `
      <div class="cmp"><b>${esc(cmp.name)}</b>　价差 ${pct(cmp.spread)}　最低在${esc(cmp.lowest)}：
        ${cmp.offers.map((o) => `${PLATFORM_ZH[o.platform] ?? o.platform} ${yuan(o.price)}${o.shopName ? `（${esc(o.shopName)}）` : ''}`).join('　')}
      </div>`).join('')

    return `
      <div class="masthead">
        <h1>${esc(sheet.title)}</h1>
        <div class="en">${esc(sheet.subtitle)}</div>
      </div>
      <div class="meta">
        <span>${esc(d.period.rangeText)}</span>
        <span>${esc(d.issue)}</span>
        <span>${esc(d.period.platformLabel)}　${sheet.categoryLabel}</span>
      </div>
      <div class="lead">
        <div class="rail">
          <h3>品类指数</h3>
          <div class="index">${sheet.index ? sheet.index.value.toFixed(1) : 'RANK'}
            <small>${sheet.index ? `${arrow(sheet.index.change)}${pct(sheet.index.change)}　${sheet.index.zone}` : '按性价比 / 性能排序'}</small></div>
          <div class="kv"><span>型号</span><span>${sheet.items.length}</span></div>
          <div class="kv"><span>近 30 日分位</span><span>${sheet.index ? (sheet.index.q30 * 100).toFixed(0) + '%' : '—'}</span></div>
          <div class="kv"><span>采集</span><span>${d.health.ok}/${d.health.total}</span></div>
        </div>
        <div class="sec" style="margin-top:0;border-top:none;padding-top:0">
          <h3>${sheet.mode === 'price' ? esc(d.period.changeLabel) + '行情' : '排名'}</h3>
          <table class="table">
            <thead>${sheet.mode === 'price'
              ? '<tr><th>型号 / 店铺</th><th>现价</th><th>周期涨跌</th><th>单日</th><th>走势</th></tr>'
              : '<tr><th>型号 / 指标</th><th>现价</th><th>说明</th></tr>'}</thead>
            <tbody>${rows || '<tr><td colspan="5">本品类暂无数据</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      ${sheet.mode === 'price' ? `<div class="sec">
        <h3>${esc(d.period.changeLabel)}异动</h3>
        <div class="two">${movers || '<div class="row">没有明显异动</div>'}</div>
      </div>` : ''}
      ${compare ? `<div class="sec"><h3>比价</h3>${compare}</div>` : ''}
      <div class="foot">
        <span>数据仅供个人参考，价格以平台页面为准</span>
        <span>型号 ${d.footer.models}　报价 ${d.footer.quotes}　耗时 ${d.footer.costMs}ms</span>
      </div>`
  },
}

/** 店铺名：优先取报价里的，其次留空 */
function shopOf(item: { offers: Array<{ shopName?: string }> }): string {
  const names = item.offers.map((o) => o.shopName).filter((x): x is string => !!x)
  return names.length ? '　' + names.slice(0, 2).join(' / ') : ''
}
