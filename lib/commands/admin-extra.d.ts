import { Context } from 'koishi';
import type { Config } from '../index';
/** 环境与数据自检：`price admin doctor` 与中文指令「自检」共用 */
export declare function runDoctor(ctx: Context, config: Config, ready: boolean): Promise<string>;
/**
 * M6 / M7 的管理指令：数据治理、自检、告警测试、登录。
 * 单独成文件，避免主指令文件继续膨胀。
 */
export declare function mountExtraAdmin(ctx: Context, config: Config, isReady: () => boolean): void;
