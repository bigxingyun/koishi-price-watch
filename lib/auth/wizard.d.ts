import { type Context } from 'koishi';
import type { Config } from '../index';
import { confirmLogin, getAuthState } from './login';
import type { Session, StepResult } from './state';
export type { Session, StepResult };
/**
 * 登录状态机（唯一一套）。
 *
 * 之前是「向导 + 单平台观察者」两套状态机各自改同一批 meta，互相抢推进，
 * 结果就是：登录拼多多，状态却显示淘宝在等待。
 *
 * 现在只有一套：
 *   session = { queue, current, results, deadline, refreshedAt, origin }
 *   状态转移只有 4 个入口：tick（自动）/ confirm / skip / cancel
 *   所有写入都可能被 tick 与命令同时触发，所以用 busy 串行化
 *
 * 不变量（改代码必须守住）：
 *   1. current 永远等于「还没出结论的第一个平台」
 *   2. 只有 advance() 能改 current 和写 results
 *   3. 超时只判一次，判完立刻 advance
 *   4. 自动检测只认行为验证（verifyLogin），不做 cookie 猜测
 */
export declare const LOGIN_ORDER: readonly ["pdd", "jd", "taobao"];
export interface LoginOrigin {
    platform: string;
    channelId: string;
    selfId?: string;
}
export interface AdvanceReply {
    text: string;
    qr?: Buffer;
    /** 整页截图（各平台都发） */
    fullPage?: Buffer;
    done: boolean;
}
export { afterAdvance, decide } from './state';
export type { StepAction, StepEvent } from './state';
export declare function getSession(ctx: Context): Promise<Session | null>;
export declare function isTicking(ctx: Context): boolean;
export declare function startWizard(ctx: Context, config: Config, origin?: LoginOrigin): Promise<AdvanceReply>;
/** 只登一个平台：先清掉旧的一轮，避免两套流程打架 */
export declare function startSingle(ctx: Context, config: Config, platform: string, origin?: LoginOrigin): Promise<AdvanceReply>;
export declare function advanceWizard(ctx: Context, config: Config, action: 'ok' | 'skip'): Promise<AdvanceReply>;
export declare function wizardStatus(ctx: Context, config: Config): Promise<string>;
export declare function loginCancel(ctx: Context): Promise<string>;
export declare const cancelWizard: typeof loginCancel;
export declare const getWizard: typeof getSession;
/** 启动时恢复：状态在库、定时器在内存，重启后必须接上 */
export declare function resumeWizard(ctx: Context, config: Config): Promise<void>;
export { confirmLogin, getAuthState };
