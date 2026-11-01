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
exports.AntiProtocolStaleError = void 0;
exports.antiReport = antiReport;
exports.antiLines = antiLines;
exports.withAnti = withAnti;
const repo = __importStar(require("../store/repo"));
const health_1 = require("./health");
/**
 * 反爬协议注册表与统一调用入口（L1.5）。
 *
 * 用法（采集层将来按需调用）：
 *
 *   const price = await withAnti(ctx, config, 'jd', async (anti) => {
 *     return fetchPriceWithH5st(anti)
 *   })
 *   失败时返回 null，采集层照常走浏览器/API 兜底 —— **绝不因为协议坏了而中断采集**。
 */
const PROVIDERS = {
// 待填：京东 h5st、拼多多 anti_content、淘宝 x5sec
};
const CACHE = new WeakMap();
function cacheOf(ctx) {
    let map = CACHE.get(ctx);
    if (!map) {
        map = new Map();
        CACHE.set(ctx, map);
    }
    return map;
}
async function loadHealth(ctx, platform) {
    const cache = cacheOf(ctx);
    const cached = cache.get(platform);
    if (cached)
        return cached;
    const raw = await repo.metaGet(ctx, `anti:${platform}`).catch(() => null);
    let health = (0, health_1.initialHealth)(platform);
    if (raw) {
        try {
            health = { ...health, ...JSON.parse(raw) };
        }
        catch {
            health = (0, health_1.initialHealth)(platform);
        }
    }
    // 版本表为准：没实现的一律标 unimplemented，避免历史上写过的 ok 残留
    if (!health_1.ANTI_VERSIONS[platform])
        health = (0, health_1.afterUnimplemented)(health);
    cache.set(platform, health);
    return health;
}
async function saveHealth(ctx, health) {
    cacheOf(ctx).set(health.platform, health);
    await repo.metaSet(ctx, `anti:${health.platform}`, JSON.stringify(health)).catch(() => undefined);
}
/** 三个平台的健康状态（给自检/状态指令用） */
async function antiReport(ctx, config) {
    const out = [];
    for (const platform of ['jd', 'pdd', 'taobao']) {
        const enabled = config.anti?.enabled !== false && config.anti?.[platform]?.enabled !== false;
        const health = await loadHealth(ctx, platform);
        out.push(enabled ? health : { ...health, state: 'disabled' });
    }
    return out;
}
function antiLines(healths) {
    const zh = { jd: '京东', pdd: '拼多多', taobao: '淘宝' };
    const lines = ['反爬协议（隔离模块，失效不影响采集主线）：'];
    for (const health of healths) {
        lines.push(`  ${zh[health.platform] ?? health.platform}：${(0, health_1.describeHealth)(health)}`);
        if (health.lastReason)
            lines.push(`    原因：${health.lastReason.slice(0, 60)}`);
    }
    const usable = healths.filter((h) => (0, health_1.isUsable)(h, Date.now())).length;
    lines.push('', usable ? `可用 ${usable} 个` : '当前没有可用的反爬协议，采集走浏览器/人工兜底');
    return lines;
}
/**
 * 统一调用入口：协议不可用或失败都不抛错，只返回 null 并记健康状态。
 * 这样采集主线永远不会因为协议问题中断。
 */
async function withAnti(ctx, config, platform, run) {
    if (config.anti?.enabled === false)
        return null;
    if (config.anti?.[platform]?.enabled === false)
        return null;
    const health = await loadHealth(ctx, platform);
    const now = Date.now();
    if (health.state === 'unimplemented' && !PROVIDERS[platform])
        return null;
    if (!(0, health_1.isUsable)(health, now))
        return null;
    const provider = PROVIDERS[platform];
    if (!provider)
        return null;
    try {
        await provider();
        const result = await run();
        await saveHealth(ctx, (0, health_1.afterSuccess)(health, Date.now()));
        return result;
    }
    catch (error) {
        if (error instanceof health_1.AntiNotImplementedError) {
            await saveHealth(ctx, (0, health_1.afterUnimplemented)(health));
            return null;
        }
        await saveHealth(ctx, (0, health_1.afterFailure)(health, error, Date.now()));
        return null;
    }
}
var health_2 = require("./health");
Object.defineProperty(exports, "AntiProtocolStaleError", { enumerable: true, get: function () { return health_2.AntiProtocolStaleError; } });
//# sourceMappingURL=index.js.map