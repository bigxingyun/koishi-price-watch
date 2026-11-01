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
exports.buildDebugReport = buildDebugReport;
exports.debugSummary = debugSummary;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const anti_1 = require("../anti");
const font_1 = require("../render/font");
const repo = __importStar(require("../store/repo"));
const logring_1 = require("../util/logring");
const quality_1 = require("./quality");
/** 关键字段脱敏：密钥、cookie、token 一律打码 */
function maskConfig(config) {
    const raw = JSON.parse(JSON.stringify(config ?? {}));
    const secrets = /secret|token|cookie|key|password|passwd/i;
    const walk = (node, path) => {
        if (Array.isArray(node))
            return node.map((item, index) => walk(item, `${path}[${index}]`));
        if (node && typeof node === 'object') {
            const out = {};
            for (const [key, value] of Object.entries(node)) {
                const nextPath = path ? `${path}.${key}` : key;
                out[key] = secrets.test(key) && typeof value === 'string' && value ? '***' : walk(value, nextPath);
            }
            return out;
        }
        return node;
    };
    return JSON.stringify(walk(raw, ''), null, 2);
}
async function fingerprint() {
    try {
        const { openProfile } = await Promise.resolve().then(() => __importStar(require('../crawler/browser')));
        const config = { collect: { profileDir: 'data/price-watch/profiles', browserHeadless: true, timeoutMs: 25000 } };
        const session = await openProfile(config, 'jd');
        const page = await session.browser.newPage({ viewport: { width: 1280, height: 900 } });
        const info = await page
            .evaluate(`JSON.stringify({
          webdriver: typeof navigator.webdriver,
          langs: navigator.languages,
          plugins: navigator.plugins?.length ?? 0,
          cores: navigator.hardwareConcurrency,
          ua: navigator.userAgent.slice(0, 120),
        })`)
            .catch(() => 'null');
        await page.close().catch(() => undefined);
        await session.close().catch(() => undefined);
        return info;
    }
    catch (error) {
        return `浏览器指纹获取失败：${error.message.slice(0, 160)}`;
    }
}
async function buildDebugReport(ctx, config) {
    const lines = [];
    const push = (title, body) => {
        lines.push('', `── ${title} ${'─'.repeat(Math.max(0, 28 - title.length))}`);
        if (Array.isArray(body))
            lines.push(...body);
        else
            lines.push(body);
    };
    push('环境', [
        `平台：${(0, node_os_1.platform)()} ${(0, node_os_1.release)()} (${(0, node_os_1.arch)()})`,
        `Node：${process.version}`,
        `CPU：${(0, node_os_1.cpus)().length} 核 · 内存：${Math.round((0, node_os_1.totalmem)() / 1024 / 1024 / 1024)} GB`,
        `DISPLAY：${process.env.DISPLAY || '(未设置)'} · WAYLAND：${process.env.WAYLAND_DISPLAY || '(未设置)'}`,
        `Chrome 路径：${config.collect.browserPath || "（未显式配置，自动探测）"}`,
        `中文字体：${(0, font_1.hasCjkFont)() ? '可用' : '缺失（出图会降级为文本）'}`,
    ]);
    push('浏览器指纹', await fingerprint());
    const healths = await (0, anti_1.antiReport)(ctx, config);
    push('反爬协议', (0, anti_1.antiLines)(healths));
    const models = await repo.listModels(ctx).catch(() => []);
    const offers = await repo.listOffers(ctx).catch(() => []);
    const quality = await (0, quality_1.qualitySummary)(ctx).catch(() => null);
    push('数据', [
        `型号 ${models.length} · 报价 ${offers.length}`,
        quality ? `今日：成功 ${quality.ok} / 失败 ${quality.failed} / 缺货 ${quality.outOfStock} / 可疑 ${quality.suspicious}` : '质量统计不可用',
        ...quality?.lastFailures.map((failure) => `  ${failure.platform} 最近失败：${failure.reason}`) ?? [],
    ]);
    push('配置（密钥已脱敏）', maskConfig(config));
    push('最近日志', (0, logring_1.formatLogs)(200));
    const text = [`硬件价格监控 · 调试报告`, `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`, ...lines].join('\n');
    const dir = (0, node_path_1.join)(process.cwd(), 'data', 'price-watch', 'debug');
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    const file = (0, node_path_1.join)(dir, `debug-${Date.now()}.txt`);
    (0, node_fs_1.writeFileSync)(file, text, 'utf8');
    return { text, file: (0, node_fs_1.existsSync)(file) ? file : '(写入失败)' };
}
/** 报告通常很长，聊天里只回摘要 + 文件路径 */
function debugSummary(report) {
    const head = report.text.split('\n').slice(0, 24).join('\n');
    return [
        head,
        '',
        '……（完整报告已写入文件）',
        `文件：${report.file}`,
        '',
        '请把这个文件发给我，里面环境、指纹、配置（密钥已打码）和最近日志都有。',
    ].join('\n');
}
//# sourceMappingURL=debug.js.map