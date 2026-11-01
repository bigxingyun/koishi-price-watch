import type { DigestModel } from './model';
/**
 * 纯文本渲染：全平台兜底形态。
 * 超长时按「比价 → 我的关注 → 异动」的顺序逐段裁剪，保证结构完整。
 */
export declare function renderText(model: DigestModel, limit?: number): string;
