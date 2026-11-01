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
exports.renderFor = renderFor;
exports.dispatch = dispatch;
const koishi_1 = require("koishi");
const repo = __importStar(require("../store/repo"));
const capability_1 = require("../render/capability");
const image_1 = require("../render/image");
const markdown_1 = require("../render/markdown");
const text_1 = require("../render/text");
const font_1 = require("../render/font");
const capability_2 = require("../render/capability");
/** 渲染成可发送的消息内容 */
async function renderFor(ctx, config, model, mode) {
    if (mode === 'image') {
        const sheets = await (0, image_1.renderSheets)(ctx, config, model);
        if (!sheets.length)
            return { content: (0, text_1.renderText)(model, config.advanced.textLimit), mode: 'text' };
        return { content: sheets.map((sheet) => koishi_1.h.image(sheet.buffer, sheet.mime)), mode };
    }
    if (mode === 'markdown') {
        return { content: (0, markdown_1.renderMarkdown)(model), mode };
    }
    return { content: (0, text_1.renderText)(model, (0, capability_2.textLimitOf)(config)), mode };
}
/** 降级链：markdown → image → text；image → text；text 无处可降 */
function fallbackChain(mode) {
    if (mode === 'markdown')
        return ['markdown', 'image', 'text'];
    if (mode === 'image')
        return ['image', 'text'];
    return ['text'];
}
/**
 * 按 pw_target 逐个投递。
 *
 * 三条纪律：
 * 1. 形态按「目标配置 → 能力表」解析，不猜平台能力
 * 2. 发送失败逐级降级，用户看不到异常
 * 3. 连续 3 次失败的目标自动置 inactive，避免每天无效重试
 */
async function dispatch(ctx, config, options) {
    const logger = ctx.logger('price-watch');
    const targets = await repo.listTargets(ctx, options.kind);
    const outcomes = [];
    if (!targets.length) {
        logger.info('没有 %s 类型的推送目标（用 price admin target add 绑定）', options.kind);
        return outcomes;
    }
    // 中文字体缺失时，图片模式直接跳过，别发豆腐块
    const imageUsable = (0, font_1.hasCjkFont)();
    if (!imageUsable)
        logger.warn('%s', (0, font_1.fontHint)());
    for (const target of targets) {
        const baseMode = (0, capability_1.resolveMode)(target.platform, target.mode || 'auto', config);
        const cap = (0, capability_1.capabilityOf)(target.platform);
        const digest = await options.build(target);
        if (!digest) {
            outcomes.push({ targetId: target.id, platform: target.platform, channelId: target.channelId, ok: true, mode: baseMode });
            continue;
        }
        // 演练模式不需要真实 bot：先把渲染跑通，日志里记一笔
        const bot = options.dryRun
            ? undefined
            : ctx.bots.find((b) => b.platform === target.platform
                && (!target.selfId || b.selfId === target.selfId));
        if (!bot && !options.dryRun) {
            const error = `找不到 ${target.platform} 的机器人实例`;
            await repo.markTargetFailed(ctx, target.id, target.failCount + 1);
            outcomes.push({ targetId: target.id, platform: target.platform, channelId: target.channelId, ok: false, mode: baseMode, error });
            continue;
        }
        let sent = false;
        let lastError;
        let usedMode = baseMode;
        for (const attempt of fallbackChain(baseMode)) {
            if (attempt === 'image' && (!cap.image || !imageUsable))
                continue;
            if (attempt === 'markdown' && !config.basic.markdownEnabled)
                continue;
            try {
                const { content } = await renderFor(ctx, config, digest, attempt);
                if (options.dryRun) {
                    const size = typeof content === 'string' ? `${content.length} 字符` : '图片';
                    logger.info('[dryRun] → %s/%s 以 %s 形态发送 %s', target.platform, target.channelId, attempt, size);
                    usedMode = attempt;
                    sent = true;
                    break;
                }
                if (!bot)
                    throw new Error('找不到机器人实例');
                await bot.sendMessage(target.channelId, content, target.guildId || undefined);
                usedMode = attempt;
                sent = true;
                break;
            }
            catch (error) {
                lastError = error.message;
                logger.warn('%s 以 %s 形态发送失败：%s', target.platform, attempt, lastError);
            }
        }
        if (sent) {
            await repo.markTargetFailed(ctx, target.id, 0);
            outcomes.push({
                targetId: target.id, platform: target.platform, channelId: target.channelId,
                ok: true, mode: usedMode,
                degradedFrom: usedMode === baseMode ? undefined : baseMode,
            });
        }
        else {
            await repo.markTargetFailed(ctx, target.id, target.failCount + 1);
            outcomes.push({
                targetId: target.id, platform: target.platform, channelId: target.channelId,
                ok: false, mode: baseMode, error: lastError,
            });
        }
    }
    return outcomes;
}
//# sourceMappingURL=transport.js.map