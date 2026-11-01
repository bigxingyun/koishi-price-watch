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
exports.isTrustedPlatform = isTrustedPlatform;
exports.listOwners = listOwners;
exports.addOwner = addOwner;
exports.ensureAdmin = ensureAdmin;
exports.adminHint = adminHint;
const repo = __importStar(require("../store/repo"));
/**
 * 「测试平台」判定。
 *
 * 为什么不能精确匹配 'sandbox'：
 * 控制台沙盒的 platform 是 `sandbox:随机后缀`（见 plugin-sandbox 客户端
 * `platform: "sandbox:" + Math.random()...`），精确匹配会全部漏掉 —— 实测踩过。
 */
function isTrustedPlatform(platform) {
    if (!platform)
        return false;
    return platform === 'mock' || platform.startsWith('sandbox');
}
/**
 * 管理员判定。
 *
 * 三级放行：
 * 1. `authority >= 4`（Koishi 内置权限）
 * 2. 命中 `advanced.owners` 白名单（格式 平台:用户ID）
 * 3. 控制台沙盒 / 测试假平台：只有已登录控制台的管理员或本地测试进程能发消息
 */
/** 运行时绑定的主人列表（存数据库，重启不丢） */
async function listOwners(ctx) {
    const raw = await repo.metaGet(ctx, 'owner:extra').catch(() => null);
    if (!raw)
        return [];
    try {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
    }
    catch {
        return [];
    }
}
async function addOwner(ctx, key) {
    const list = await listOwners(ctx);
    if (list.includes(key))
        return;
    list.push(key);
    await repo.metaSet(ctx, 'owner:extra', JSON.stringify(list));
}
async function ensureAdmin(ctx, session, config) {
    if (!session)
        return false;
    if (isTrustedPlatform(session.platform))
        return true;
    const user = session.user;
    if ((user?.authority ?? 0) >= 4)
        return true;
    const key = `${session.platform}:${session.userId}`;
    if (config.advanced.owners.includes(key))
        return true;
    if (ctx && (await listOwners(ctx)).includes(key))
        return true;
    return false;
}
/** 给「仅主人可用」的提示语：直接告诉用户该填什么 */
function adminHint(session) {
    const key = session ? `${session.platform}:${session.userId ?? '?'}` : '平台:用户ID';
    return [
        '只有主人能用。两种办法：',
        `  1. 在「高级 → 主人身份」里加上：${key}`,
        '  2. 或把你的账号权限设为 4（控制台 → 用户）',
        '',
        '想知道自己的准确标识：发「价格 管理 我是谁」',
    ].join('\n');
}
//# sourceMappingURL=auth.js.map