import { Context, type Fragment } from 'koishi';
import type { Config, RenderMode } from '../index';
import type { PwTarget } from '../store/model';
import type { DigestModel } from '../render/model';
export type RenderKind = Exclude<RenderMode, 'auto'>;
export interface TargetOutcome {
    targetId: number;
    platform: string;
    channelId: string;
    ok: boolean;
    mode: RenderKind;
    degradedFrom?: RenderKind;
    error?: string;
}
/** 渲染成可发送的消息内容 */
export declare function renderFor(ctx: Context, config: Config, model: DigestModel, mode: RenderKind): Promise<{
    content: Fragment;
    mode: RenderKind;
}>;
export interface DispatchOptions {
    kind: string;
    /** 为单个目标构建内容；返回 null 表示跳过该目标 */
    build: (target: PwTarget) => Promise<DigestModel | null>;
    dryRun?: boolean;
}
/**
 * 按 pw_target 逐个投递。
 *
 * 三条纪律：
 * 1. 形态按「目标配置 → 能力表」解析，不猜平台能力
 * 2. 发送失败逐级降级，用户看不到异常
 * 3. 连续 3 次失败的目标自动置 inactive，避免每天无效重试
 */
export declare function dispatch(ctx: Context, config: Config, options: DispatchOptions): Promise<TargetOutcome[]>;
