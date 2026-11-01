"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK = exports.CAPABILITY = void 0;
exports.capabilityOf = capabilityOf;
exports.textLimitOf = textLimitOf;
exports.resolveMode = resolveMode;
exports.CAPABILITY = {
    qq: { label: 'QQ 官方', textLimit: 600, markdown: true, image: true },
    onebot: { label: 'OneBot', textLimit: 4500, markdown: false, image: true },
    telegram: { label: 'Telegram', textLimit: 4096, markdown: true, image: true },
    discord: { label: 'Discord', textLimit: 2000, markdown: true, image: true },
    kook: { label: 'KOOK', textLimit: 5000, markdown: true, image: true },
    lark: { label: '飞书', textLimit: 1800, markdown: false, image: true },
    slack: { label: 'Slack', textLimit: 4000, markdown: true, image: true },
    matrix: { label: 'Matrix', textLimit: 8000, markdown: true, image: true },
    dingtalk: { label: '钉钉', textLimit: 1800, markdown: false, image: true },
    wecom: { label: '企业微信', textLimit: 1800, markdown: false, image: true },
    mail: { label: '邮件', textLimit: 100000, markdown: true, image: true },
    line: { label: 'LINE', textLimit: 5000, markdown: false, image: true },
    satori: { label: 'Satori', textLimit: 4000, markdown: true, image: true },
    sandbox: { label: '沙盒', textLimit: 8000, markdown: true, image: true },
};
exports.FALLBACK = { label: '未知平台', textLimit: 1800, markdown: false, image: true };
function capabilityOf(platform) {
    if (!platform)
        return exports.FALLBACK;
    // 控制台沙盒的 platform 是 `sandbox:xxxx`，要用前缀匹配
    if (platform.startsWith('sandbox'))
        return exports.CAPABILITY.sandbox;
    return exports.CAPABILITY[platform] ?? exports.FALLBACK;
}
/**
 * 文本上限：统一用配置里的「一条消息最长多少字」。
 * 不做「每个平台一个上限」——那对用户来说是不可维护的抽象。
 * 平台差异交给发送失败后的自动降级处理。
 */
function textLimitOf(config) {
    return config.advanced.textLimit;
}
/**
 * 决定最终渲染形态。
 * - 显式指定则以指定为准（markdown 还需开关允许）
 * - auto：能力表支持的优先 markdown（若开启）→ image → text
 * - 图片不可用（浏览器缺失）时由调用方捕获异常再降级到 text
 */
function resolveMode(platform, requested, config) {
    const cap = capabilityOf(platform);
    if (requested !== 'auto') {
        if (requested === 'markdown' && !config.basic.markdownEnabled)
            return cap.image ? 'image' : 'text';
        return requested;
    }
    if (config.basic.markdownEnabled && cap.markdown)
        return 'markdown';
    if (cap.image)
        return 'image';
    return 'text';
}
//# sourceMappingURL=capability.js.map