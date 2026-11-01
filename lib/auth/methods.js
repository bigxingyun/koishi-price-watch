"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGIN_SPECS = void 0;
exports.loginSpecOf = loginSpecOf;
exports.loginMethodOf = loginMethodOf;
exports.loginUaOf = loginUaOf;
exports.platformUaOf = platformUaOf;
exports.describeStep = describeStep;
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
exports.LOGIN_SPECS = {
    jd: {
        method: 'qrcode',
        url: 'https://passport.jd.com/new/login.aspx',
        methodLabel: '扫码',
        hint: '用京东 APP 扫一扫',
    },
    taobao: {
        method: 'qrcode',
        url: 'https://login.taobao.com/member/login.jhtml',
        desktopUA: true,
        methodLabel: '扫码',
        hint: '用淘宝 APP 扫一扫',
    },
    pdd: {
        method: 'qrcode',
        url: 'https://mobile.yangkeduo.com/login.html',
        methodLabel: '扫码',
        hint: '用拼多多 APP 扫一扫（页面默认停在「手机登录」，插件会自动点「扫码登录」切过去）',
    },
};
function loginSpecOf(platform) {
    return exports.LOGIN_SPECS[platform];
}
function loginMethodOf(platform) {
    return exports.LOGIN_SPECS[platform]?.method ?? 'unknown';
}
function loginUaOf(spec, mobileUa) {
    return spec.desktopUA ? DESKTOP_UA : mobileUa;
}
/**
 * 采集时必须用**和登录时同一个 UA**。
 * 淘宝是用桌面 UA 登录的（手机版没有二维码），如果采集换回手机 UA，
 * cookie 会被判为换设备而失效 —— 表现就是「登录了但采集说没登录」。
 */
function platformUaOf(platform, mobileUa) {
    const spec = exports.LOGIN_SPECS[platform];
    return spec?.desktopUA ? DESKTOP_UA : mobileUa;
}
/** 向导里给每一步的一句话说明 */
function describeStep(platform, zhName) {
    const spec = exports.LOGIN_SPECS[platform];
    if (!spec)
        return `${zhName}：暂不支持登录`;
    return spec.method === 'qrcode'
        ? `${zhName}：扫码登录（${spec.hint}）`
        : `${zhName}：${spec.methodLabel}（${spec.hint}）`;
}
//# sourceMappingURL=methods.js.map