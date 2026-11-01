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
exports.detectAlerts = detectAlerts;
exports.loadLows = loadLows;
exports.collectAlerts = collectAlerts;
exports.pushAlerts = pushAlerts;
const constants_1 = require("../constants");
const repo = __importStar(require("../store/repo"));
const KIND_LABEL = {
    surge: '七日急涨',
    plunge: '七日急跌',
    newLow: '创三十日新低',
    dailyDrop: '单日下跌',
};
/** 判断哪些型号触发了告警（纯逻辑，便于测试） */
function detectAlerts(stats, models, options) {
    const nameMap = new Map(models.map((m) => [m.id, m.name]));
    const alerts = [];
    for (const stat of stats) {
        const name = nameMap.get(stat.modelId) ?? stat.modelId;
        const base = { modelId: stat.modelId, name, price: stat.price };
        if (stat.r7 >= options.r7Threshold) {
            alerts.push({
                ...base,
                kind: 'surge',
                headline: `${name} 七日上涨 ${(stat.r7 * 100).toFixed(1)}%`,
                detail: `现价 ${(0, constants_1.money)(stat.price)}　${stat.grade} ${stat.modifier}　分位 ${(stat.q30 * 100).toFixed(0)}%`,
            });
        }
        else if (stat.r7 <= -Math.abs(options.r7Threshold)) {
            alerts.push({
                ...base,
                kind: 'plunge',
                headline: `${name} 七天下跌 ${(Math.abs(stat.r7) * 100).toFixed(1)}%`,
                detail: `现价 ${(0, constants_1.money)(stat.price)}　${stat.grade} ${stat.modifier}　分位 ${(stat.q30 * 100).toFixed(0)}%`,
            });
        }
        else if (stat.d1 <= -Math.abs(options.dailyDropThreshold)) {
            alerts.push({
                ...base,
                kind: 'dailyDrop',
                headline: `${name} 单日下跌 ${(Math.abs(stat.d1) * 100).toFixed(1)}%`,
                detail: `现价 ${(0, constants_1.money)(stat.price)}　${stat.grade} ${stat.modifier}`,
            });
        }
        else if (options.newLowEnabled && stat.n30 >= 21) {
            const low = options.lows.get(stat.modelId);
            if (low && stat.price <= low) {
                alerts.push({
                    ...base,
                    kind: 'newLow',
                    headline: `${name} 创三十日新低`,
                    detail: `现价 ${(0, constants_1.money)(stat.price)}　${stat.grade} ${stat.modifier}　置信度${stat.confidence}`,
                });
            }
        }
    }
    return alerts;
}
/** 取每个型号最近 30 日的最低代表价 */
async function loadLows(ctx, day = (0, constants_1.toDay)()) {
    const daily = await repo.getDaily(ctx, [], (0, constants_1.shiftDay)(day, -30));
    const lows = new Map();
    for (const row of daily) {
        if (!row.median)
            continue;
        const prev = lows.get(row.modelId);
        if (prev === undefined || row.median < prev)
            lows.set(row.modelId, row.median);
    }
    return lows;
}
/** 生成待发告警（已过 24h 去重） */
async function collectAlerts(ctx, config, day = (0, constants_1.toDay)()) {
    if (!config.alert.enabled)
        return [];
    const stats = (await repo.getAllStats(ctx)).filter((s) => s.n30 >= 7);
    if (!stats.length)
        return [];
    const models = await repo.listModels(ctx);
    const lows = await loadLows(ctx, day);
    const candidates = detectAlerts(stats, models, {
        r7Threshold: config.alert.r7Threshold,
        dailyDropThreshold: config.alert.dailyDropThreshold,
        newLowEnabled: config.alert.newLowEnabled,
        lows,
    });
    // 同型号同类 24 小时内只发一次
    const fresh = [];
    for (const alert of candidates) {
        const key = `alertSent:${alert.modelId}:${alert.kind}`;
        const last = Number(await repo.metaGet(ctx, key)) || 0;
        if (Date.now() - last < 24 * 3600_000)
            continue;
        fresh.push(alert);
    }
    return fresh;
}
/** 把告警发给所有 alert 目标（纯文本，失败计数复用 pw_target） */
async function pushAlerts(ctx, config, options = {}) {
    const logger = ctx.logger('price-watch');
    const alerts = await collectAlerts(ctx, config);
    if (!alerts.length)
        return { sent: 0, skipped: 0 };
    const targets = (await repo.listTargets(ctx)).filter((t) => t.kind === 'alert');
    if (!targets.length) {
        logger.info('有 %d 条告警，但没有 alert 类型的推送目标', alerts.length);
        return { sent: 0, skipped: alerts.length };
    }
    const dryRun = options.dryRun ?? config.advanced.dryRun;
    let sent = 0;
    let skipped = 0;
    for (const target of targets) {
        const quota = await takeQuota(ctx, target, config.alert.perChannelDaily);
        if (quota <= 0) {
            skipped += alerts.length;
            continue;
        }
        for (const alert of alerts.slice(0, quota)) {
            const text = `⚠ ${KIND_LABEL[alert.kind]}\n${alert.headline}\n${alert.detail}`;
            if (dryRun) {
                logger.info('[dryRun] 告警 → %s/%s：%s', target.platform, target.channelId, alert.headline);
                sent++;
                continue;
            }
            const bot = ctx.bots.find((b) => b.platform === target.platform
                && (!target.selfId || b.selfId === target.selfId));
            if (!bot)
                break;
            try {
                await bot.sendMessage(target.channelId, text, target.guildId || undefined);
                await repo.markTargetFailed(ctx, target.id, 0);
                await repo.metaSet(ctx, `alertSent:${alert.modelId}:${alert.kind}`, String(Date.now()));
                sent++;
            }
            catch (error) {
                logger.warn('告警发送失败：%s', error.message);
                await repo.markTargetFailed(ctx, target.id, target.failCount + 1);
                break;
            }
        }
    }
    return { sent, skipped };
}
/** 单目标当日剩余配额 */
async function takeQuota(ctx, target, daily) {
    const key = `alertQuota:${target.id}:${(0, constants_1.toDay)()}`;
    const used = Number(await repo.metaGet(ctx, key)) || 0;
    const left = Math.max(0, daily - used);
    if (left > 0)
        await repo.metaSet(ctx, key, String(used + 1));
    return left;
}
//# sourceMappingURL=alert.js.map