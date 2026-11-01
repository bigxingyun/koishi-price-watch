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
exports.runDoctor = runDoctor;
exports.mountExtraAdmin = mountExtraAdmin;
const koishi_1 = require("koishi");
const login_1 = require("../auth/login");
const font_1 = require("../render/font");
const guard_1 = require("../crawler/guard");
const alert_1 = require("../notify/alert");
const gc_1 = require("../store/gc");
const demo_1 = require("../dev/demo");
const aggregate_1 = require("../store/aggregate");
const repo = __importStar(require("../store/repo"));
const auth_1 = require("../util/auth");
/** 环境与数据自检：`price admin doctor` 与中文指令「自检」共用 */
async function runDoctor(ctx, config, ready) {
    const checks = [];
    const ok = (name, detail) => checks.push(`✅ ${name}：${detail}`);
    const bad = (name, detail) => checks.push(`❌ ${name}：${detail}`);
    ok('数据库', '可用');
    ok('http 服务', typeof ctx.http === 'function' ? '可用' : '缺失（采集会失败）');
    ok('插件就绪', ready ? '是' : '否');
    if ((0, font_1.hasCjkFont)())
        ok('中文字体', '可用');
    else
        bad('中文字体', (0, font_1.fontHint)());
    // 浏览器：真的拉起一次再关掉，避免「配置看着对但跑不起来」
    if (!config.collect.browserEnabled) {
        checks.push('⚠ 浏览器采集：未开启（图片渲染仍可用，京东/淘宝/拼多多采集会跳过）');
    }
    else {
        try {
            const { getBrowserPool } = await Promise.resolve().then(() => __importStar(require('../crawler/browser')));
            const pool = getBrowserPool(ctx, {
                executablePath: config.collect.browserPath,
                headless: true,
            });
            const browser = await pool.acquire();
            const page = await browser.newPage({ viewport: { width: 200, height: 100 } });
            await page.close();
            pool.release();
            ok('浏览器', '可启动');
        }
        catch (error) {
            bad('浏览器', error.message);
        }
    }
    const tables = await (0, gc_1.stats)(ctx);
    checks.push(`📊 数据量：${tables.map((t) => `${t.table} ${t.rows}`).join(' · ')}`);
    const offers = await repo.listOffers(ctx);
    const platforms = [...new Set(offers.filter((o) => o.active).map((o) => o.platform))];
    if (!platforms.length) {
        checks.push('⚠ 报价：还没有绑定任何商品链接（price admin offer <型号> <平台> <链接>）');
    }
    for (const platform of platforms) {
        const state = await (0, login_1.getAuthState)(ctx, platform);
        const block = await (0, guard_1.isBlocked)(ctx, platform);
        const count = await (0, guard_1.getCount)(ctx, platform);
        const parts = [`auth=${state}`, `今日请求 ${count}/${config.collect.dailyCap}`];
        if (block.blocked)
            parts.push(`熔断至 ${block.until?.toLocaleString()}（${block.reason}）`);
        checks.push(`${block.blocked ? '⛔' : '·'} ${platform}：${parts.join('、')}`);
    }
    const targets = await repo.listTargets(ctx);
    checks.push(targets.length
        ? `📮 推送目标 ${targets.length} 个：${targets.map((t) => `${t.platform}/${t.kind}`).join('、')}`
        : '⚠ 推送目标：还没有（用「推送目标 add digest」或 price admin target add）');
    const models = await repo.listModels(ctx);
    const stats = await repo.getAllStats(ctx);
    checks.push(`🧮 型号 ${models.length} 个，已有指标 ${stats.length} 个`);
    return checks.join('\n');
}
/**
 * M6 / M7 的管理指令：数据治理、自检、告警测试、登录。
 * 单独成文件，避免主指令文件继续膨胀。
 */
function mountExtraAdmin(ctx, config, isReady) {
    const admin = ctx.command('price.admin');
    admin.subcommand('.gc', '清理过期数据（保留期见配置）')
        .option('dryRun', '-n, --dryRun 只统计不删除')
        .action(async (argv) => {
        if (!(await (0, auth_1.ensureAdmin)(argv.session, config)))
            return '仅管理员可用';
        const result = await (0, gc_1.gc)(ctx, config, { dryRun: !!argv.options?.dryRun });
        const lines = [
            `快照保留 ${config.data.snapshotDays} 天 → 截止 ${result.cutoff.snapshot}`,
            `聚合保留 ${config.data.dailyDays} 天 → 截止 ${result.cutoff.daily}`,
            result.dryRun
                ? `演练：将删除快照 ${result.snapshots} 行、聚合 ${result.daily} 行`
                : `已删除快照 ${result.snapshots} 行、聚合 ${result.daily} 行、人工录入 ${result.manual} 条`,
        ];
        return lines.join('\n');
    });
    admin.subcommand('.demo [days:number]', '灌演示数据（仅 advanced.debug=true 时可用）')
        .action(async (argv, days) => {
        if (!(await (0, auth_1.ensureAdmin)(argv.session, config)))
            return '仅管理员可用';
        if (!config.advanced.debug)
            return '演示数据只在 advanced.debug=true 时可用，避免污染真实库';
        const span = Math.min(90, Math.max(7, days ?? 32));
        const seeded = await (0, demo_1.seedDemo)(ctx, { days: span });
        const rebuilt = await (0, aggregate_1.rebuildAll)(ctx);
        return [
            `已生成演示数据：${seeded.offers} 条报价 / ${seeded.snapshots} 条快照（${span} 天）`,
            `聚合重建：daily ${rebuilt.daily} 行 / stat ${rebuilt.stat} 行`,
            '演示报价没有真实商品 ID，采集时会自动跳过，不会去打外网。',
        ].join('\n');
    });
    admin.subcommand('.doctor', '环境与数据自检')
        .action(async (argv) => {
        if (!(await (0, auth_1.ensureAdmin)(argv.session, config)))
            return '仅管理员可用';
        return runDoctor(ctx, config, isReady());
    });
    admin.subcommand('.alert', '立即检查并发送告警（默认演练）')
        .option('dryRun', '-n, --dryRun 只打印不发送')
        .action(async (argv) => {
        if (!(await (0, auth_1.ensureAdmin)(argv.session, config)))
            return '仅管理员可用';
        const result = await (0, alert_1.pushAlerts)(ctx, config, { dryRun: argv.options?.dryRun ?? true });
        return `告警检查完成：发送 ${result.sent} 条，跳过 ${result.skipped} 条`;
    });
    admin.subcommand('.login <platform:string>', '获取某平台的登录二维码')
        .action(async (argv, platform) => {
        if (!(await (0, auth_1.ensureAdmin)(argv.session, config)))
            return '仅管理员可用';
        if (!platform)
            return '用法：price admin login jd / taobao / pdd';
        const ticket = await (0, login_1.requestLogin)(ctx, config, platform);
        if (!ticket.ok || !ticket.qr)
            return ticket.message;
        return [ticket.message, koishi_1.h.image(ticket.qr, 'image/png')];
    });
    admin.subcommand('.login.done <platform:string>', '确认已扫码登录')
        .action(async (argv, platform) => {
        if (!(await (0, auth_1.ensureAdmin)(argv.session, config)))
            return '仅管理员可用';
        if (!platform)
            return '用法：price admin login.done jd';
        return (0, login_1.confirmLogin)(ctx, platform);
    });
}
//# sourceMappingURL=admin-extra.js.map