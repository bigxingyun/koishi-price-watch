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
exports.getCount = getCount;
exports.incrCount = incrCount;
exports.isBlocked = isBlocked;
exports.blockPlatform = blockPlatform;
exports.unblock = unblock;
exports.checkGuard = checkGuard;
const constants_1 = require("../constants");
const repo = __importStar(require("../store/repo"));
const countKey = (platform, day) => `guard:${platform}:${day}`;
const blockKey = (platform) => `block:${platform}`;
async function getCount(ctx, platform, day = (0, constants_1.toDay)()) {
    const raw = await repo.metaGet(ctx, countKey(platform, day));
    if (!raw)
        return 0;
    try {
        return JSON.parse(raw).count ?? 0;
    }
    catch {
        return 0;
    }
}
/** 记一次请求，返回累计次数 */
async function incrCount(ctx, platform, day = (0, constants_1.toDay)()) {
    const next = (await getCount(ctx, platform, day)) + 1;
    await repo.metaSet(ctx, countKey(platform, day), JSON.stringify({ count: next }));
    return next;
}
async function isBlocked(ctx, platform) {
    const raw = await repo.metaGet(ctx, blockKey(platform));
    if (!raw)
        return { blocked: false };
    try {
        const state = JSON.parse(raw);
        if (state.until > Date.now())
            return { blocked: true, until: new Date(state.until), reason: state.reason };
        // 过期了顺手清掉
        await repo.metaDel(ctx, blockKey(platform));
        return { blocked: false };
    }
    catch {
        return { blocked: false };
    }
}
/** 熔断：检测到验证码/登录失效/403 时调用 */
async function blockPlatform(ctx, platform, hours, reason) {
    const state = { until: Date.now() + hours * 3600_000, reason };
    await repo.metaSet(ctx, blockKey(platform), JSON.stringify(state));
}
async function unblock(ctx, platform) {
    await repo.metaDel(ctx, blockKey(platform));
}
/** 采集前的总闸检查 */
async function checkGuard(ctx, platform, dailyCap, day = (0, constants_1.toDay)()) {
    const block = await isBlocked(ctx, platform);
    if (block.blocked) {
        return { ok: false, reason: `${platform} 冷却中（至 ${block.until?.toLocaleString()}，原因：${block.reason}）` };
    }
    const count = await getCount(ctx, platform, day);
    if (count >= dailyCap) {
        return { ok: false, reason: `${platform} 已达当日请求上限 ${dailyCap} 次` };
    }
    return { ok: true };
}
//# sourceMappingURL=guard.js.map