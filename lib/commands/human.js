"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountHumanCommands = mountHumanCommands;
const constants_1 = require("../constants");
const collect_1 = require("../crawler/collect");
const gc_1 = require("../store/gc");
const aggregate_1 = require("../store/aggregate");
const demo_1 = require("../dev/demo");
const auth_1 = require("../util/auth");
const price_1 = require("./price");
/**
 * 中文指令层。
 *
 * 设计动机：`price admin gc --dryRun` 这种写法对普通用户不友好。
 * 这里给每个常用动作一个「正常人说得出」的名字，英文指令树保持不变（脚本与老用户不受影响），
 * 两者共用同一套业务处理函数，不存在两套逻辑。
 */
function mountHumanCommands(ctx, config, isReady) {
    const report = (kind) => ctx.command(kind === 'daily' ? '日报 [平台:string]' : kind === 'weekly' ? '周报 [平台:string]' : '月报 [平台:string]', kind === 'daily' ? '今日价格报表（可指定平台：京东/淘宝/拼多多）'
        : kind === 'weekly' ? '近 7 日价格报表（可指定平台）'
            : '近 30 日价格报表（可指定平台）')
        .usage(kind === 'daily' ? '例：日报　/　日报 京东　/　日报 -i' : `例：${kind === 'weekly' ? '周报' : '月报'}　/　加 -i 出图片`)
        .option('image', '-i, --image 输出图片')
        .option('markdown', '-m, --markdown 输出 Markdown')
        .action(async ({ session, options }, platform) => (0, price_1.handleReport)(ctx, config, session, {
        kind,
        platform,
        image: !!options?.image,
        markdown: !!options?.markdown,
    }));
    report('daily');
    report('weekly');
    report('monthly');
    ctx.command('查价 <型号:text>', '查一个型号现在多少钱')
        .action(async ({}, query) => (0, price_1.handleQuery)(ctx, config, query));
    ctx.command('趋势 <型号:text> [天数:number] [平台:string]', '看价格走势（默认 30 天）')
        .action(async ({}, query, days, platform) => (0, price_1.handleTrend)(ctx, config, query, days, platform));
    ctx.command('排行 [数量:number]', '涨跌最猛的前几个')
        .action(async ({}, count) => (0, price_1.handleTop)(ctx, config, count));
    ctx.command('型号 [品类:string]', '看型号库（品类可填 显卡/内存/SSD）')
        .action(async ({}, category) => (0, price_1.handleList)(ctx, config, category));
    ctx.command('订阅 <型号:text>', '订阅一个型号，报表里会单独列出')
        .action(async ({ session }, query) => (0, price_1.handleSubscribe)(ctx, (0, price_1.scopeOf)(session), query));
    ctx.command('退订 <型号:text>', '取消订阅')
        .action(async ({ session }, query) => (0, price_1.handleUnsubscribe)(ctx, (0, price_1.scopeOf)(session), query));
    ctx.command('我的订阅', '看本会话订阅了哪些型号')
        .action(async ({ session }) => (0, price_1.handleSubList)(ctx, (0, price_1.scopeOf)(session)));
    // ── 管理类快捷指令（仅主人） ──────────────────────────────
    const guard = async (session) => (0, auth_1.ensureAdmin)(session, config);
    const deny = '仅主人可用';
    ctx.command('采集', '立刻采集一轮（管理）')
        .action(async ({ session }) => {
        if (!(await guard(session)))
            return deny;
        const result = await (0, collect_1.runCollect)(ctx, config, {});
        return `采集完成：${result.ok} 成功 / ${result.failed} 失败 / ${result.skipped} 跳过，用时 ${Math.round(result.elapsedMs / 1000)}s`;
    });
    ctx.command('清理', '清理过期数据（管理）')
        .option('dryRun', '-n, --dryRun 只统计不删除')
        .action(async ({ session, options }) => {
        if (!(await guard(session)))
            return deny;
        const result = await (0, gc_1.gc)(ctx, config, { dryRun: !!options?.dryRun });
        return result.dryRun
            ? `演练：将删除快照 ${result.snapshots} 行、聚合 ${result.daily} 行`
            : `已删除快照 ${result.snapshots} 行、聚合 ${result.daily} 行`;
    });
    ctx.command('重建', '从快照重建聚合与指标（管理）')
        .action(async ({ session }) => {
        if (!(await guard(session)))
            return deny;
        const result = await (0, aggregate_1.rebuildAll)(ctx);
        return `重建完成：daily ${result.daily} 行 / stat ${result.stat} 行`;
    });
    ctx.command('演示数据 [天数:number]', '灌一份演示数据（管理，仅 debug 模式）')
        .action(async ({ session }, days) => {
        if (!(await guard(session)))
            return deny;
        if (!config.advanced.debug)
            return '演示数据只在 advanced.debug=true 时可用';
        const span = Math.min(90, Math.max(7, days ?? 32));
        const seeded = await (0, demo_1.seedDemo)(ctx, { days: span });
        const rebuilt = await (0, aggregate_1.rebuildAll)(ctx);
        return `已生成 ${seeded.offers} 条报价 / ${seeded.snapshots} 条快照（${span} 天），重建 ${rebuilt.daily} 行`;
    });
    ctx.command('价格帮助', '中文指令速查表')
        .action(async ({ session }) => {
        const lines = [
            '【看价格】',
            '  查价 5070ti　　　　　看单个型号现在多少钱',
            '  趋势 5070ti 30　　　 看走势（天数可选，默认 30）',
            '  排行 5　　　　　　　 涨跌最猛的前 5',
            '  型号 显卡　　　　　　看型号库（显卡/内存/SSD）',
            '',
            '【看报表】',
            '  日报　　　　　　　　 今日报表',
            '  周报　　　　　　　　 近 7 日报表',
            '  月报　　　　　　　　 近 30 日报表',
            '  日报 京东　　　　　　只看京东',
            '  周报 淘宝 -i　　　　 淘宝周报，出图片',
            '',
            '【订阅】',
            '  订阅 990pro　　　　　加进报表的「我的关注」',
            '  退订 990pro　　　　　取消',
            '  我的订阅　　　　　　 看本会话订阅了啥',
            '',
            '【管理】（仅主人）',
            '  采集　　　　　　　　 立刻采一轮',
            '  清理 -n　　　　　　　看能清多少（去掉 -n 真删）',
            '  重建　　　　　　　　 重算指标',
            '  演示数据 32　　　　　灌 32 天假数据',
            '  自检　　　　　　　　 环境检查（price admin doctor）',
            '  推送目标 add digest　把当前会话设为推送目标',
        ];
        return lines.join('\n');
    });
    // 自检复用 admin 的实现（避免两处格式不一致，这里只做转发提示）
    ctx.command('自检', '环境与数据自检（管理）')
        .action(async ({ session }) => {
        if (!(await guard(session)))
            return deny;
        const { runDoctor } = await Promise.resolve().then(() => __importStar(require('./admin-extra')));
        return runDoctor(ctx, config, isReady());
    });
    void constants_1.toDay;
}
//# sourceMappingURL=human.js.map