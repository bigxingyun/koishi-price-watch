import { Context } from 'koishi';
export declare function getCount(ctx: Context, platform: string, day?: number): Promise<number>;
/** 记一次请求，返回累计次数 */
export declare function incrCount(ctx: Context, platform: string, day?: number): Promise<number>;
export interface BlockInfo {
    blocked: boolean;
    until?: Date;
    reason?: string;
}
export declare function isBlocked(ctx: Context, platform: string): Promise<BlockInfo>;
/** 熔断：检测到验证码/登录失效/403 时调用 */
export declare function blockPlatform(ctx: Context, platform: string, hours: number, reason: string): Promise<void>;
export declare function unblock(ctx: Context, platform: string): Promise<void>;
export interface GuardDecision {
    ok: boolean;
    reason?: string;
}
/** 采集前的总闸检查 */
export declare function checkGuard(ctx: Context, platform: string, dailyCap: number, day?: number): Promise<GuardDecision>;
