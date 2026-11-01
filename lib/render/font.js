"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasCjkFont = hasCjkFont;
exports.fontHint = fontHint;
const node_child_process_1 = require("node:child_process");
/**
 * 中文字体可用性自检。
 *
 * 为什么必须做：Linux 容器里若没有 CJK 字体，报纸风版式会退化成别的字形，
 * 中文甚至渲染成方块（豆腐块）。宁可降级成纯文本，也不要发一张废图。
 *
 * 零依赖：只用 node:child_process 调 fc-list（Linux）。
 */
function hasCjkFont() {
    if (process.platform === 'win32' || process.platform === 'darwin')
        return true;
    try {
        const out = (0, node_child_process_1.execSync)('fc-list :lang=zh', { encoding: 'utf8', timeout: 5000 });
        return out.trim().length > 0;
    }
    catch {
        return false;
    }
}
/** 给日志用的字体安装提示 */
function fontHint() {
    return process.platform === 'linux'
        ? '缺少中文字体：apt install -y fonts-noto-cjk（Debian/Ubuntu）或 apk add font-noto-cjk（Alpine）'
        : '当前系统应自带中文字体；若图片中文异常，请检查系统字体';
}
//# sourceMappingURL=font.js.map