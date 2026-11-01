"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountAliases = mountAliases;
/**
 * 指令别名层。
 *
 * 设计原则（一个插件只应占一个一级指令）：
 *   price              ← 唯一的一级指令
 *   price daily        ← 二级
 *   price admin target ← 三级
 *
 * 中文名做成**别名**而不是新的一级指令，这样：
 * - 全局指令空间干净（17 个一级 → 1 个）
 * - 「价格 日报」「价格 管理 推送 加」都能打
 * - 英文 `price daily` / `price admin target add` 同样可用
 */
const ALIASES = {
    'price': ['价格', 'p'],
    'price.ping': ['连通'],
    'price.daily': ['日报', 'day'],
    'price.weekly': ['周报', 'week'],
    'price.monthly': ['月报', 'month'],
    'price.trend': ['趋势'],
    'price.top': ['排行', '榜'],
    'price.list': ['型号', '全部'],
    'price.watch': ['关注'],
    'price.watch.add': ['加'],
    'price.watch.remove': ['删', '取消'],
    'price.watch.list': ['列表'],
    'price.admin': ['管理'],
    'price.admin.collect': ['采集'],
    'price.admin.doctor': ['自检'],
    'price.admin.gc': ['清理'],
    'price.admin.demo': ['演示'],
    'price.admin.rebuild': ['重建'],
    'price.admin.status': ['状态'],
    'price.admin.models': ['型号库'],
    'price.admin.offer': ['绑定'],
    'price.admin.set': ['录入'],
    'price.admin.login': ['登录'],
    'price.admin.preset': ['预设'],
    'price.admin.unblock': ['解封'],
    'price.admin.target': ['推送'],
};
function mountAliases(ctx, config) {
    // 给已注册的指令挂别名（同名调用会拿到同一个 Command 实例）
    for (const [name, aliases] of Object.entries(ALIASES)) {
        ctx.command(name).alias(...aliases);
    }
    ctx.command('price.help', '中文速查表')
        .alias('帮助', 'help')
        .action(() => [
        '【价格】',
        '  价格 5070ti　　　　　看这个型号现在多少钱',
        '  价格 趋势 5070ti　　 看走势（可加天数：价格 趋势 5070ti 60）',
        '  价格 排行　　　　　　 涨跌最猛的前五',
        '  价格 型号 显卡　　　　看型号库（显卡 / 内存 / SSD）',
        '',
        '【报表】',
        '  价格 日报　　　　　　 今日',
        '  价格 周报　　　　　　 近 7 日',
        '  价格 月报　　　　　　 近 30 日',
        '  价格 日报 京东　　　　只看京东（淘宝 / 拼多多 / 全部）',
        '  价格 周报 淘宝 -i　　 出图（等价于 --mode image）',
        '',
        '【订阅】',
        '  价格 关注 加 990pro　　加进报表的「我的关注」',
        '  价格 关注 删 990pro　　取消',
        '  价格 关注 列表　　　　 看订阅了啥',
        '',
        '【管理】（只有主人能用）',
        '  价格 管理 采集　　　　 立刻抓一轮',
        '  价格 管理 自检　　　　 环境检查（报错先看这个）',
        '  价格 管理 清理　　　　 清过期数据（加 -n 只统计）',
        '  价格 管理 演示 32　　　灌 32 天假数据',
        '  价格 管理 推送 加　　　把当前会话设为推送目标',
        '  价格 管理 绑定 5070ti 京东 <链接>　绑定商品',
        '  价格 管理 录入 5070ti 6299　　　　手工录今日价',
    ].join('\n'));
}
//# sourceMappingURL=aliases.js.map