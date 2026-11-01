"use strict";
/** 全局常量与日期工具：零依赖，只用原生 Date */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEEKDAY = exports.DAY_MS = exports.STATUS = exports.CATEGORY_LABEL = exports.CATEGORIES = void 0;
exports.toCents = toCents;
exports.toYuan = toYuan;
exports.toDay = toDay;
exports.fromDay = fromDay;
exports.diffDays = diffDays;
exports.shiftDay = shiftDay;
exports.formatDay = formatDay;
exports.issueNo = issueNo;
exports.median = median;
exports.trimmedMean = trimmedMean;
exports.mean = mean;
exports.stdev = stdev;
exports.clamp = clamp;
exports.round = round;
exports.money = money;
exports.moneyPlain = moneyPlain;
exports.CATEGORIES = ['gpu', 'ram', 'ssd'];
exports.CATEGORY_LABEL = {
    gpu: '显卡',
    ram: '内存',
    ssd: 'SSD',
};
/** 快照状态码 */
exports.STATUS = {
    OK: 0,
    OUT_OF_STOCK: 1,
    DELISTED: 2,
    FAILED: 3,
    SUSPICIOUS: 4,
};
exports.DAY_MS = 86_400_000;
/** 价格一律以「分」为整数单位存储，避免浮点 */
function toCents(yuan) {
    return Math.round(yuan * 100);
}
function toYuan(cents) {
    return cents / 100;
}
/** Date → YYYYMMDD 整数（用本地时区，与用户看到的日期一致） */
function toDay(date = new Date()) {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
/** YYYYMMDD → 当天 00:00 的 Date */
function fromDay(day) {
    return new Date(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100);
}
/** a 比 b 晚多少天（a - b） */
function diffDays(a, b) {
    return Math.round((fromDay(a).getTime() - fromDay(b).getTime()) / exports.DAY_MS);
}
/** day 往前推 n 天 */
function shiftDay(day, n) {
    return toDay(new Date(fromDay(day).getTime() + n * exports.DAY_MS));
}
function formatDay(day) {
    const d = fromDay(day);
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${exports.WEEKDAY[d.getDay()]}`;
}
exports.WEEKDAY = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
/** 中文数字期号（第 001 期） */
function issueNo(day, baseDay) {
    const n = Math.max(1, diffDays(day, baseDay) + 1);
    return `第 ${String(n).padStart(3, '0')} 期`;
}
/** 中位数（不改原数组） */
function median(values) {
    if (!values.length)
        return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** 截尾均值：去掉最高最低各一个（n≥3 时） */
function trimmedMean(values) {
    if (values.length <= 2)
        return median(values);
    const s = [...values].sort((a, b) => a - b).slice(1, -1);
    return s.reduce((a, b) => a + b, 0) / s.length;
}
function mean(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
/** 样本标准差（n-1 分母，n<2 时返回 0） */
function stdev(values) {
    if (values.length < 2)
        return 0;
    const m = mean(values);
    const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (values.length - 1);
    return Math.sqrt(v);
}
function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
}
function round(x, digits = 1) {
    const p = 10 ** digits;
    return Math.round(x * p) / p;
}
/** 金额格式化：分 → ¥6,299 */
function money(cents) {
    // 内部按「分」存储，展示一律取整到元：真实商品价不会有角分
    return '¥' + String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** 金额格式化（不带货币符号）：分 → 6,299 */
function moneyPlain(cents) {
    return money(cents).slice(1);
}
//# sourceMappingURL=constants.js.map