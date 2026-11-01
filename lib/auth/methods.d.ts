/**
 * 各平台登录方式。
 *
 * 不是「一律扫码」——实测（2026-10，无头 Chrome + 真实请求）：
 *
 * | 平台 | 页面原文 | 扫码 |
 * | ---- | -------- | ---- |
 * | 拼多多 | 有「扫码登录」标签，但默认停在「手机登录」，二维码要点一下才渲染 | ✅ 有（需先切 tab） |
 * | 京东 | 「京东APP扫码登录」「密码登录」「短信登录」「微信登录」 | ✅ 有 |
 * | 淘宝 | 用 PC 地址 + 手机 UA 会跳 `login.m.taobao.com`，只剩手机号/账密 | ✅ 用桌面 UA 才是扫码 |
 *
 * 所以必须按平台分流，否则会出现「给拼多多发一张根本不存在的二维码」这种假动作。
 */
export type LoginMethod = 'qrcode' | 'window';
export interface LoginSpec {
    /** qrcode：截图让用户扫；window：弹一个真窗口让用户自己登（手机号收验证码） */
    method: LoginMethod;
    url: string;
    /** 用桌面 UA（淘宝 PC 登录页才有二维码） */
    desktopUA?: boolean;
    /** 给人看的方式名 */
    methodLabel: string;
    /** 操作提示 */
    hint: string;
}
export declare const LOGIN_SPECS: Record<string, LoginSpec>;
export declare function loginSpecOf(platform: string): LoginSpec | undefined;
export declare function loginMethodOf(platform: string): LoginMethod | 'unknown';
export declare function loginUaOf(spec: LoginSpec, mobileUa: string): string;
/**
 * 采集时必须用**和登录时同一个 UA**。
 * 淘宝是用桌面 UA 登录的（手机版没有二维码），如果采集换回手机 UA，
 * cookie 会被判为换设备而失效 —— 表现就是「登录了但采集说没登录」。
 */
export declare function platformUaOf(platform: string, mobileUa: string): string;
/** 向导里给每一步的一句话说明 */
export declare function describeStep(platform: string, zhName: string): string;
