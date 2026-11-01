"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonical = canonical;
exports.sign = sign;
exports.timestamp = timestamp;
exports.jdSign = jdSign;
exports.pddSign = pddSign;
exports.taobaoSign = taobaoSign;
const node_crypto_1 = require("node:crypto");
/** 过滤空值并按 key 字典序拼接 k+v */
function canonical(params) {
    return Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== '')
        .sort()
        .map((key) => `${key}${params[key]}`)
        .join('');
}
/** secret + 拼串 + secret，MD5 后大写 */
function sign(secret, params) {
    return (0, node_crypto_1.createHash)('md5').update(secret + canonical(params) + secret).digest('hex').toUpperCase();
}
/** 时间戳：各平台都接受 `yyyy-MM-dd HH:mm:ss` */
function timestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
/** 京东联盟：参数塞进 360buy_param_json，签名只覆盖外层 */
function jdSign(secret, params) {
    return sign(secret, params);
}
/** 拼多多：sign 覆盖除 sign 之外的全部参数 */
function pddSign(secret, params) {
    return sign(secret, params);
}
/** 淘宝：sign 覆盖除 sign 之外的全部参数 */
function taobaoSign(secret, params) {
    return sign(secret, params);
}
//# sourceMappingURL=sign.js.map