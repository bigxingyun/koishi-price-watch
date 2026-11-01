/**
 * 反爬协议层（隔离模块，L1.5）。
 *
 * 设计目标：**协议失效不能拖累主链路**。
 *
 * 平台的反爬参数（京东 h5st、拼多多 anti_content、淘宝 x5sec）是随版本滚动的协议，
 * 迟早会失效。所以这里：
 *   1. 每个协议实现独立成文件，只在 enabled 时加载
 *   2. 任何失败都不抛给采集主线，只记健康状态并降级
 *   3. 连续失败达到阈值自动熔断，避免每轮都去撞
 *   4. `价格 管理 协议` 能一眼看到「谁在用、版本多少、最近是否失败」
 *
 * 依赖方向：本模块不 import 采集/渲染/指令，只有采集层可选用它。
 */
export type AntiPlatform = 'jd' | 'pdd' | 'taobao';
/** 协议版本：失效时靠它判断「是不是版本过期」而不是「网络抖动」 */
export declare const ANTI_VERSIONS: Record<AntiPlatform, string | null>;
/** 协议过期（明确知道对方换了协议，不是偶发失败） */
export declare class AntiProtocolStaleError extends Error {
    readonly platform: AntiPlatform;
    constructor(platform: AntiPlatform, message: string);
}
/** 协议未实现：和「过期」区分开，避免健康统计被未实现项污染 */
export declare class AntiNotImplementedError extends Error {
    readonly platform: AntiPlatform;
    constructor(platform: AntiPlatform);
}
export type AntiState = 'ok' | 'degraded' | 'stale' | 'disabled' | 'unimplemented';
export interface AntiHealth {
    platform: AntiPlatform;
    state: AntiState;
    version: string | null;
    /** 连续失败次数 */
    failures: number;
    /** 熔断到期时间（毫秒），0 表示未熔断 */
    disabledUntil: number;
    /** 最后一次失败原因 */
    lastReason?: string;
    /** 最后一次检查时间 */
    checkedAt?: number;
}
/** 连续失败多少次就熔断 */
export declare const FAIL_THRESHOLD = 3;
/** 熔断时长：1 小时 */
export declare const DISABLE_MS: number;
export declare function initialHealth(platform: AntiPlatform): AntiHealth;
/**
 * 健康状态转移（纯函数，可单测）。
 *
 * - 成功：清零失败计数、回到 ok
 * - 协议过期：立刻 stale（不重试，等人修）
 * - 普通失败：累计；到阈值 → degraded + 熔断
 * - 熔断期间：disabled，采集层直接跳过，不再发请求
 */
export declare function afterSuccess(health: AntiHealth, now: number): AntiHealth;
export declare function afterFailure(health: AntiHealth, error: unknown, now: number): AntiHealth;
export declare function afterUnimplemented(health: AntiHealth): AntiHealth;
/**
 * 当前是否可用。
 * 熔断到期后回到「半开」：允许再试一次，成功就恢复，失败继续熔断。
 */
export declare function isUsable(health: AntiHealth, now: number): boolean;
/** 给人看的一句话 */
export declare function describeHealth(health: AntiHealth): string;
