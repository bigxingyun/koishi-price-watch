/**
 * 中文字体可用性自检。
 *
 * 为什么必须做：Linux 容器里若没有 CJK 字体，报纸风版式会退化成别的字形，
 * 中文甚至渲染成方块（豆腐块）。宁可降级成纯文本，也不要发一张废图。
 *
 * 零依赖：只用 node:child_process 调 fc-list（Linux）。
 */
export declare function hasCjkFont(): boolean;
/** 给日志用的字体安装提示 */
export declare function fontHint(): string;
