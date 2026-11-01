import type { DigestModel } from './model';
/**
 * Markdown 渲染：给官方 QQ 机器人、Telegram、Discord、KOOK、Slack、Matrix 等支持 md 的平台用。
 * 与图片分支并列，不经过 HTML，也不依赖 markdown 解析库。
 */
export declare function renderMarkdown(model: DigestModel): string;
