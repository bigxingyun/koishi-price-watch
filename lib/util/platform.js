"use strict";
/**
 * 平台名归一化。
 *
 * 用户会用「京东 / 京东商城 / jd / JD」「拼多多 / 拼夕夕 / pdd」「淘宝 / 天猫 / taobao」，
 * 但内部只认 `jd` / `pdd` / `taobao`。所有接收平台参数的指令都必须先过这里，
 * 否则就会出现「暂不支持 拼多多 的登录」这种把中文名当平台键的 bug。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_TEXT = exports.PLATFORM_KEYS = void 0;
exports.normalizePlatform = normalizePlatform;
exports.platformChoices = platformChoices;
exports.platformLabel = platformLabel;
const ALIASES = {
    jd: 'jd',
    '京东': 'jd',
    '京东商城': 'jd',
    'jingdong': 'jd',
    pdd: 'pdd',
    '拼多多': 'pdd',
    '拼夕夕': 'pdd',
    'pinduoduo': 'pdd',
    taobao: 'taobao',
    '淘宝': 'taobao',
    '淘宝网': 'taobao',
    '天猫': 'taobao',
    tmall: 'taobao',
};
exports.PLATFORM_KEYS = ['jd', 'pdd', 'taobao'];
exports.PLATFORM_TEXT = {
    jd: '京东',
    pdd: '拼多多',
    taobao: '淘宝',
    manual: '人工',
    mock: '演示',
};
/** 认不出返回 null（调用方要给出可读的候选列表） */
function normalizePlatform(input) {
    if (!input)
        return null;
    const key = input.trim().toLowerCase();
    return ALIASES[key] ?? ALIASES[input.trim()] ?? null;
}
/** 给报错用的候选提示 */
function platformChoices() {
    return '京东 / 拼多多 / 淘宝（也可以写 jd / pdd / taobao）';
}
/** 中文名（认不出就原样返回） */
function platformLabel(platform) {
    return exports.PLATFORM_TEXT[platform] ?? platform;
}
//# sourceMappingURL=platform.js.map