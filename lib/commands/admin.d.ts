import { Context } from 'koishi';
import type { Config } from '../index';
/** 环境与数据自检 */
export declare function runDoctor(ctx: Context, config: Config, ready: boolean): Promise<string>;
/**
 * 管理指令树：`price admin *` 与 `价格 管理 *` 各注册一份。
 * 两级中文名（如「管理 推送 加」）需要逐层注册，否则 Koishi 无法解析。
 */
export declare function mountAdmin(ctx: Context, config: Config, isReady: () => boolean): void;
