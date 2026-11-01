import type { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 登录自检。
 *
 * 目的**只有一个**：回答「这三个平台现在能不能登录 / 是否已经登录」。
 *
 * 所以这里**不截二维码、不点「扫码登录」、不裁剪图片** ——
 * 那是「发起登录」这个动作的职责。两件事混在一起会让自检多花 20 秒，
 * 还会答非所问（之前就是把自检写成了一次完整登录流程）。
 *
 * 自检只做四件跟「能不能用」有关的事：
 *   1. 登录方式是否定义（扫码 / 窗口）
 *   2. 浏览器采集是否开启（关着必然登不了）
 *   3. 登录页是否可达（HTTP 探活，不启浏览器）
 *   4. 登录态是否有效（行为验证：导航会员页/登录页，看是否被踢）
 */
export interface SelfCheckRow {
    platform: string;
    method: string;
    specOk: boolean;
    browserOk: boolean;
    profileExists: boolean;
    profilePath: string;
    cookieCount: number;
    pageStatus: string;
    loggedIn: boolean | null;
    detail: string;
}
export declare function runLoginSelfCheck(ctx: Context, config: Config): Promise<string>;
