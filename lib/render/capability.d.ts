import type { Config, RenderMode } from '../index';
/**
 * 平台能力表。
 *
 * 三个诚实说明（设计文档 §2.7.3）：
 * 1. 数字不是契约：随适配器版本与平台策略变化，所以可被配置覆盖
 * 2. markdown 必须由主人显式开启，插件**不猜**平台能力
 * 3. 最终保险是「发送失败自动降级」，这张表只保证第一次大概率成功
 */
export interface Capability {
    label: string;
    /** 单条文本参考上限（字符） */
    textLimit: number;
    markdown: boolean;
    image: boolean;
}
export declare const CAPABILITY: Record<string, Capability>;
export declare const FALLBACK: Capability;
export declare function capabilityOf(platform: string | undefined): Capability;
/**
 * 文本上限：统一用配置里的「一条消息最长多少字」。
 * 不做「每个平台一个上限」——那对用户来说是不可维护的抽象。
 * 平台差异交给发送失败后的自动降级处理。
 */
export declare function textLimitOf(config: Config): number;
/**
 * 决定最终渲染形态。
 * - 显式指定则以指定为准（markdown 还需开关允许）
 * - auto：能力表支持的优先 markdown（若开启）→ image → text
 * - 图片不可用（浏览器缺失）时由调用方捕获异常再降级到 text
 */
export declare function resolveMode(platform: string | undefined, requested: RenderMode, config: Config): Exclude<RenderMode, 'auto'>;
