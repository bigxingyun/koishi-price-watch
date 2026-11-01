/**
 * 平台名归一化。
 *
 * 用户会用「京东 / 京东商城 / jd / JD」「拼多多 / 拼夕夕 / pdd」「淘宝 / 天猫 / taobao」，
 * 但内部只认 `jd` / `pdd` / `taobao`。所有接收平台参数的指令都必须先过这里，
 * 否则就会出现「暂不支持 拼多多 的登录」这种把中文名当平台键的 bug。
 */
export type PlatformKey = 'jd' | 'pdd' | 'taobao';
export declare const PLATFORM_KEYS: PlatformKey[];
export declare const PLATFORM_TEXT: Record<string, string>;
/** 认不出返回 null（调用方要给出可读的候选列表） */
export declare function normalizePlatform(input?: string | null): PlatformKey | null;
/** 给报错用的候选提示 */
export declare function platformChoices(): string;
/** 中文名（认不出就原样返回） */
export declare function platformLabel(platform: string): string;
