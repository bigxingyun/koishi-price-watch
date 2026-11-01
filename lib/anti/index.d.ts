import type { Context } from 'koishi';
import type { Config } from '../index';
import { type AntiHealth, type AntiPlatform } from './health';
/** 三个平台的健康状态（给自检/状态指令用） */
export declare function antiReport(ctx: Context, config: Config): Promise<AntiHealth[]>;
export declare function antiLines(healths: AntiHealth[]): string[];
/**
 * 统一调用入口：协议不可用或失败都不抛错，只返回 null 并记健康状态。
 * 这样采集主线永远不会因为协议问题中断。
 */
export declare function withAnti<T>(ctx: Context, config: Config, platform: AntiPlatform, run: () => Promise<T>): Promise<T | null>;
export { AntiProtocolStaleError } from './health';
