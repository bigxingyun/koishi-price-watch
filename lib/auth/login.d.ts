import { Context } from 'koishi';
import type { Config } from '../index';
import { type LoginMethod } from './methods';
/**
 * 登录态维护。
 *
 * 三条事实决定了实现方式：
 * 1. **浏览器必须用持久化 profile**，否则登录成功后 cookie 随浏览器关闭一起消失
 *    （之前用 chromium.launch() 就是这个致命 bug，登录等于白做）
 * 2. **各平台登录方式不同**：京东/淘宝有扫码，拼多多只有手机号+短信（见 methods.ts）
 * 3. **扫码/输验证码都需要人在场**，所以流程是「开一个窗口 → 你去操作 → 回来发确认 → 我验证 cookie」
 */
export type AuthState = 'ok' | 'expired' | 'pending' | 'failed';
export declare function getAuthState(ctx: Context, platform: string): Promise<AuthState | 'unknown'>;
export declare function setAuthState(ctx: Context, platform: string, state: AuthState): Promise<void>;
export interface LoginTicket {
    ok: boolean;
    platform: string;
    message: string;
    /** 只有扫码平台才有 */
    qr?: Buffer;
    method?: LoginMethod;
    /** 需要用户在弹出的窗口里操作 */
    needsWindow?: boolean;
    /** 二维码模块矩阵（用于控制台打印） */
    matrix?: boolean[][];
    /** 整页截图：各平台统一发送，能看清当前停在哪个登录方式 */
    fullPage?: Buffer;
}
/**
 * 开始登录某平台：开窗口 / 截二维码。
 * 窗口会**保持打开**，直到用户发「确认」或「跳过」。
 */
export declare function requestLogin(ctx: Context, config: Config, platform: string, options?: {
    forceWindow?: boolean;
    origin?: LoginOrigin;
}): Promise<LoginTicket>;
/**
 * 纯函数：从 cookie 名单里找登录凭据。
 * 单独抽出来是为了能单测——这类判断出错会导致「登录了却说没登录」。
 */
export declare function matchLoginCookie(platform: string, names: string[]): {
    hit: boolean;
    matched: string[];
};
export type CookieSnapshot = Record<string, string>;
/**
 * 记录当前平台的 cookie 指纹快照。
 *
 * 为什么要这个：拼多多的 PDDAccessToken / 淘宝的 cookie2 在**未登录时也会存在**，
 * 光看「有没有」会误判成已登录；而京东的 pt_key 是 HttpOnly，看 document.cookie 又读不到。
 * 所以用「**值变了没有**」来判断：登录成功一定会换会话。
 */
export declare function snapshotCookies(ctx: Context, config: Config, platform: string): Promise<CookieSnapshot>;
/**
 * 快速判断「登录态是否发生变化」——不打开页面，只读 cookie，适合每 2 秒轮询一次。
 *
 * 判定规则：
 * 1. 京东的 pt_key 出现 = 已登录（最强信号）
 * 2. 任意关键 cookie 的值与快照不同 = 会话换了 = 已登录
 *
 * 注意：这是「可能已登录」，最终确认仍走 verifyLogin 的行为验证。
 */
export declare function snapshotChanged(platform: string, before: CookieSnapshot | undefined, after: CookieSnapshot): {
    changed: boolean;
    reason: string;
};
/** 轮询用：cookie 变没变（不导航，快） */
export declare function quickCheckLogin(ctx: Context, config: Config, platform: string, before: CookieSnapshot | undefined): Promise<{
    loggedIn: boolean;
    reason: string;
}>;
export interface VerifyResult {
    loggedIn: boolean;
    detail: string;
}
/** 去目标站点读一次 document.cookie，看有没有登录凭据 */
export declare function verifyLogin(ctx: Context, config: Config, platform: string): Promise<VerifyResult>;
export interface ConfirmResult {
    ok: boolean;
    message: string;
    /** 失败时顺手给一张新二维码（旧码多半已过期） */
    qr?: Buffer;
}
/** 用户说「扫完了」：验证 cookie → 记录状态 → 关窗口 */
export declare function confirmLogin(ctx: Context, config: Config, platform: string): Promise<ConfirmResult>;
/** 跳过某平台的登录：关窗口 + 标记为未登录 */
export declare function skipLogin(ctx: Context, platform: string): Promise<void>;
export interface CookieCheck {
    loggedIn: boolean;
    evidence: string;
}
/** 用「决定性 cookie」判断是否真的登录了 */
export declare function evaluateCookies(platform: string, cookies: Array<{
    name: string;
    value: string;
}>): CookieCheck;
export interface PlatformAuthInfo {
    platform: string;
    zh: string;
    state: AuthState | 'unknown';
    /** profile 目录是否存在（存在不代表登录，但不存在一定没登录） */
    profileExists: boolean;
    profilePath: string;
    cookieCount: number;
    /** 该平台的关键 cookie 名（能读出来说明已在磁盘上） */
    keyCookies: string[];
    /** 判定依据 */
    evidence: string;
    lastAt?: string;
}
/** 读磁盘上的 profile，看关键 cookie 还在不在（这才是「持久化」的证据） */
export declare function inspectPlatform(ctx: Context, config: Config, platform: string): Promise<PlatformAuthInfo>;
/** 三个平台一起体检，给「价格 管理 登录 状态」用 */
export declare function authReport(ctx: Context, config: Config): Promise<string>;
/** 兼容导出：真正的实现在 selfcheck.ts，避免循环依赖 */
export declare function loginSelfCheck(ctx: Context, config: Config): Promise<string>;
interface LoginOrigin {
    platform: string;
    channelId: string;
    selfId?: string;
}
export declare function beginActiveLogin(ctx: Context, config: Config, platform: string, origin?: LoginOrigin): Promise<void>;
export declare function clearActiveLogin(ctx: Context): Promise<void>;
/** 启动时恢复：上次没走完的单平台登录，把观察者重新接上 */
export declare function resumeLoginWatch(ctx: Context, config: Config): Promise<void>;
export declare function isLoginWatching(ctx: Context): boolean;
export declare function stopLoginWatch(ctx: Context): void;
export declare function startLoginWatch(ctx: Context, config: Config): void;
export {};
