import { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 浏览器池。
 *
 * 两种用法，对应两种完全不同的需求：
 *
 * 1. `getRenderPool` —— 图片渲染。不需要 cookie，用普通 launch，快、无状态。
 * 2. `withProfile` / `openProfile` —— 采集与登录。**必须用持久化 profile**，
 *    否则登录成功后 cookie 随浏览器关闭一起消失，登录等于白做（这是之前的致命 bug）。
 *
 * 每个平台一个独立 profile 目录：京东/淘宝/拼多多的 cookie 混在一起会互相踩。
 */
export interface PageLike {
    setContent(html: string, options?: Record<string, unknown>): Promise<void>;
    evaluate<T = unknown>(fn: string | ((...args: never[]) => T), arg?: unknown): Promise<T>;
    setViewportSize(size: {
        width: number;
        height: number;
    }): Promise<void>;
    screenshot(options?: Record<string, unknown>): Promise<Buffer>;
    close(): Promise<void>;
    goto?(url: string, options?: Record<string, unknown>): Promise<unknown>;
    waitForSelector?(selector: string, options?: Record<string, unknown>): Promise<unknown>;
    textContent?(selector: string): Promise<string | null>;
    content?(): Promise<string>;
}
export interface CookieLike {
    name: string;
    value: string;
    domain: string;
    httpOnly?: boolean;
}
export interface BrowserLike {
    newPage(options?: Record<string, unknown>): Promise<PageLike>;
    /** 浏览器级 cookie 读取：**能看到 HttpOnly**，document.cookie 看不到（京东 pt_key 就是 HttpOnly） */
    cookies?(urls?: string | string[]): Promise<CookieLike[]>;
    close(): Promise<void>;
}
declare const IDLE_CLOSE_MS: number;
declare const CONTEXT_IDLE_MS: number;
declare class RenderPool {
    private config;
    private browser?;
    private launching?;
    private leases;
    private timer?;
    private closed;
    constructor(config: Config);
    acquire(): Promise<BrowserLike>;
    release(): void;
    close(): Promise<void>;
}
export declare function getRenderPool(ctx: Context, config: Config): RenderPool;
/** 渲染一张图：拿到页面 → 用完自动关 */
export declare function withRenderPage<T>(ctx: Context, config: Config, fn: (page: PageLike) => Promise<T>): Promise<T>;
export declare function profileDirOf(config: Config, platform: string): string;
export interface ProfileSession {
    browser: BrowserLike;
    close: () => Promise<void>;
}
/**
 * 打开某平台的持久化 profile。
 *
 * @param forceHeaded 需要人工操作时（例如拼多多手机号登录）强制显示窗口
 */
export declare function openProfile(config: Config, platform: string, options?: {
    forceHeaded?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
}): Promise<ProfileSession>;
/** 用一次持久化 profile 跑一段逻辑，结束后关闭（cookie 已落盘） */
export declare function withProfile<T>(config: Config, platform: string, fn: (browser: BrowserLike) => Promise<T>): Promise<T>;
export declare function acquireProfile(ctx: Context, config: Config, platform: string): Promise<BrowserLike>;
/** 手动关掉某平台的采集会话（例如刚登录完，想立刻用新 cookie） */
export declare function closeProfile(ctx: Context, platform: string): Promise<void>;
export declare function getLoginWindow(ctx: Context, platform: string): ProfileSession | undefined;
export declare function keepLoginWindow(ctx: Context, config: Config, platform: string, headed?: boolean, viewport?: {
    width: number;
    height: number;
}): Promise<ProfileSession>;
export declare function closeLoginWindow(ctx: Context, platform: string): Promise<boolean>;
export { IDLE_CLOSE_MS, CONTEXT_IDLE_MS };
/**
 * 反检测初始化脚本（每个新页面注入一次）。
 *
 * 无头模式即使加了 --disable-blink-features 仍会暴露 navigator.webdriver=true，
 * 平台据此直接判定自动化。这里把最常见的几个指纹抹平：
 *   webdriver / plugins / languages / chrome.runtime / permissions.query
 * 目标不是"骗过所有检测"，而是"别在第一步就被筛掉"。
 */
export declare const STEALTH_SCRIPT = "\n  Object.defineProperty(navigator, \"webdriver\", { get: () => undefined })\n  Object.defineProperty(navigator, \"languages\", { get: () => [\"zh-CN\", \"zh\", \"en\"] })\n  Object.defineProperty(navigator, \"plugins\", { get: () => [1, 2, 3, 4, 5] })\n  Object.defineProperty(navigator, \"hardwareConcurrency\", { get: () => 8 })\n  window.chrome = window.chrome || { runtime: {} }\n  if (navigator.permissions && navigator.permissions.query) {\n    const original = navigator.permissions.query.bind(navigator.permissions)\n    navigator.permissions.query = (params) => params && params.name === \"notifications\"\n      ? Promise.resolve({ state: Notification.permission })\n      : original(params)\n  }\n";
/** 给 context 装上 stealth（幂等） */
export declare function applyStealth(browser: BrowserLike): Promise<void>;
