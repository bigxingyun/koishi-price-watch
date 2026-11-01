"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthError = exports.ParseError = exports.FetchError = void 0;
class FetchError extends Error {
    status;
    url;
    constructor(message, status = 0, url = '') {
        super(message);
        this.status = status;
        this.url = url;
        this.name = 'FetchError';
    }
}
exports.FetchError = FetchError;
/** 解析失败（页面结构变了 / 价格被混淆） */
class ParseError extends Error {
    sample;
    constructor(message, sample = '') {
        super(message);
        this.sample = sample;
        this.name = 'ParseError';
    }
}
exports.ParseError = ParseError;
/** 登录态失效 / 验证码：需要熔断并通知主人 */
class AuthError extends Error {
    platform;
    constructor(message, platform = '') {
        super(message);
        this.platform = platform;
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
//# sourceMappingURL=types.js.map