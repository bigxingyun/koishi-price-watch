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
exports.sourceOf = sourceOf;
exports.resolveSource = resolveSource;
exports.setSource = setSource;
exports.sourceTable = sourceTable;
const api_1 = require("../api");
const repo = __importStar(require("../store/repo"));
const PLATFORMS = ['jd', 'pdd', 'taobao'];
function sourceOf(config, platform) {
    const value = config.source?.[platform];
    return value ?? 'auto';
}
async function resolveSource(ctx, config, platform) {
    // 本地平台（mock / manual）不需要网络也不需要浏览器，直接走适配器。
    // 之前它们被 auto 判成 manual，导致「演示数据一条都采不到」。
    if (!['jd', 'pdd', 'taobao'].includes(platform)) {
        return { source: 'browser', reason: '本地平台直接走适配器', fromChat: false };
    }
    // 拼多多网页端价格会被打码（「前往APP查看价格」）、京东搜索有验证墙，
    // 两家都不再尝试网页抓取，只走官方 API。
    if (platform === 'pdd' || platform === 'jd') {
        return { source: 'api', reason: '该平台网页端已不可用，只走官方 API', fromChat: false };
    }
    const override = (await repo.metaGet(ctx, `source:${platform}`));
    if (override && ['auto', 'api', 'browser', 'manual'].includes(override)) {
        return { source: override, reason: `聊天里设置为 ${override}`, fromChat: true };
    }
    const configured = sourceOf(config, platform);
    if (configured !== 'auto') {
        return { source: configured, reason: `配置指定 ${configured}`, fromChat: false };
    }
    if ((0, api_1.apiReady)(config, platform)) {
        return { source: 'api', reason: '已配置联盟密钥（auto）', fromChat: false };
    }
    if (config.collect.browserEnabled) {
        return { source: 'browser', reason: '未配置密钥，回退浏览器（auto）', fromChat: false };
    }
    return { source: 'manual', reason: '既无密钥也未开浏览器（auto）', fromChat: false };
}
async function setSource(ctx, platform, source) {
    const key = `source:${platform}`;
    if (source === 'clear') {
        await repo.metaDel(ctx, key);
        return;
    }
    await repo.metaSet(ctx, key, source);
}
/** 给状态命令用：三个平台的最终数据源 */
async function sourceTable(ctx, config) {
    const out = [];
    for (const platform of PLATFORMS) {
        out.push({ platform, ...(await resolveSource(ctx, config, platform)) });
    }
    return out;
}
//# sourceMappingURL=source.js.map