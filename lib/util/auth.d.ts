import type { Session } from 'koishi';
import type { Config } from '../index';
/**
 * 「测试平台」判定。
 *
 * 为什么不能精确匹配 'sandbox'：
 * 控制台沙盒的 platform 是 `sandbox:随机后缀`（见 plugin-sandbox 客户端
 * `platform: "sandbox:" + Math.random()...`），精确匹配会全部漏掉 —— 实测踩过。
 */
export declare function isTrustedPlatform(platform: string | undefined): boolean;
/**
 * 管理员判定。
 *
 * 三级放行：
 * 1. `authority >= 4`（Koishi 内置权限）
 * 2. 命中 `advanced.owners` 白名单（格式 平台:用户ID）
 * 3. 控制台沙盒 / 测试假平台：只有已登录控制台的管理员或本地测试进程能发消息
 */
/** 运行时绑定的主人列表（存数据库，重启不丢） */
export declare function listOwners(ctx: import('koishi').Context): Promise<string[]>;
export declare function addOwner(ctx: import('koishi').Context, key: string): Promise<void>;
export declare function ensureAdmin(ctx: import('koishi').Context | null, session: Session | undefined, config: Config): Promise<boolean>;
/** 给「仅主人可用」的提示语：直接告诉用户该填什么 */
export declare function adminHint(session: Session | undefined): string;
