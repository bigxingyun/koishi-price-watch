"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LPRS = exports.STS = void 0;
exports.computeShort = computeShort;
exports.percentileRank = percentileRank;
exports.theilSen = theilSen;
exports.computeLong = computeLong;
exports.categoryIndex = categoryIndex;
exports.representativePrice = representativePrice;
/**
 * 指标计算：全部为纯函数，不碰 ctx、不碰数据库。
 * 输入价格序列 → 输出指标对象，因此可以用固定序列做快照测试。
 *
 * 短期 STS（7 日）与长期 LPRS（30 日）的标准定义见设计文档 §2.5。
 */
const constants_1 = require("../constants");
/** STS 阈值（可用配置覆盖，这里给默认值） */
exports.STS = {
    sharpUp: 0.08,
    up: 0.03,
    down: -0.03,
    sharpDown: -0.08,
    volatileCv: 0.06,
};
/** LPRS 阈值 */
exports.LPRS = {
    lowS: 0.2,
    lowA: 0.35,
    highC: 0.65,
    highD: 0.8,
    strongUp: 0.06,
    weakUp: 0.02,
    strongDown: -0.06,
    weakDown: -0.02,
    cvGood: 0.1,
    cvPoor: 0.2,
    minSamples: 21,
    fullSamples: 30,
};
function sortPoints(points) {
    return [...points].sort((a, b) => a.day - b.day);
}
/** 7 日窗口（含今日，按自然日回看 7 天内的点） */
function windowOf(points, days) {
    if (!points.length)
        return [];
    const end = points[points.length - 1].day;
    const start = end - days + 1;
    return points.filter((p) => p.day >= start);
}
/** 最近一个「距今 ≥ n 天」的记录，找不到则 null */
function basePoint(points, n) {
    if (!points.length)
        return null;
    const target = points[points.length - 1].day - n;
    for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].day <= target)
            return points[i];
    }
    return null;
}
function classify7(r) {
    if (r === null)
        return '样本不足';
    if (r >= exports.STS.sharpUp)
        return '急涨';
    if (r >= exports.STS.up)
        return '上涨';
    if (r > exports.STS.down)
        return '横盘';
    if (r > exports.STS.sharpDown)
        return '下跌';
    return '急跌';
}
/** 连续同向天数：与前一天比较，同号累计 */
function computeStreak(points) {
    if (points.length < 2)
        return 0;
    let streak = 0;
    for (let i = points.length - 1; i > 0; i--) {
        const diff = points[i].price - points[i - 1].price;
        if (diff === 0)
            break;
        const sign = diff > 0 ? 1 : -1;
        if (streak === 0)
            streak = sign;
        else if (Math.sign(streak) === sign)
            streak += sign;
        else
            break;
    }
    return streak;
}
/**
 * 短期信号（7 日）。
 *
 * 降级规则（设计文档 §1.6）：
 * - n ≥ 5 且有 7 日基准 → full
 * - 2 ≤ n < 5 或无 7 日基准 → accumulated（用首日→今日的累计变化，并且不出 7 日标签）
 * - n < 2 → insufficient
 */
function computeShort(raw) {
    const points = sortPoints(raw);
    const n = points.length;
    if (n < 2) {
        return {
            n, r7: null, pos7: null, cv7: null, streak: 0,
            label: '样本不足', mode: 'insufficient', accumulated: null,
        };
    }
    const current = points[n - 1];
    const base = basePoint(points, 6);
    const win = windowOf(points, 7);
    const prices = win.map((p) => p.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const avg = (0, constants_1.mean)(prices);
    const cv7 = avg ? (0, constants_1.stdev)(prices) / avg : 0;
    const pos7 = high === low ? 0.5 : (0, constants_1.clamp)((current.price - low) / (high - low), 0, 1);
    const accumulated = points[0].price ? current.price / points[0].price - 1 : null;
    const full = n >= 5 && base !== null;
    const r7 = full && base.price ? current.price / base.price - 1 : null;
    return {
        n,
        r7,
        pos7,
        cv7: (0, constants_1.round)(cv7, 4),
        streak: computeStreak(points),
        label: full ? classify7(r7) : '样本不足',
        mode: full ? 'full' : 'accumulated',
        accumulated: accumulated === null ? null : (0, constants_1.round)(accumulated, 4),
    };
}
/**
 * 30 日分位：当前价在样本中的百分位（0=最低，1=最高）。
 * 相同价格按「各占一半」处理，避免大量重复值把分位推向极端。
 */
function percentileRank(current, history) {
    if (history.length < 2)
        return 0.5;
    let below = 0;
    let equal = 0;
    for (const v of history) {
        if (v < current)
            below++;
        else if (v === current)
            equal++;
    }
    return (0, constants_1.clamp)((below + equal / 2) / (history.length - 1), 0, 1);
}
/**
 * Theil–Sen 中位斜率：所有点对斜率的中位数。
 * 比最小二乘抗离群点（秒杀断崖、大促台阶），这是选它的唯一理由。
 */
function theilSen(xs, ys) {
    const slopes = [];
    for (let i = 0; i < xs.length; i++) {
        for (let j = i + 1; j < xs.length; j++) {
            const dx = xs[j] - xs[i];
            if (dx !== 0)
                slopes.push((ys[j] - ys[i]) / dx);
        }
    }
    if (!slopes.length)
        return 0;
    slopes.sort((a, b) => a - b);
    const mid = slopes.length >> 1;
    return slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;
}
function classifyGrade(q30, r30) {
    if (q30 >= exports.LPRS.highD && r30 >= exports.STS.up)
        return 'D';
    if (q30 >= exports.LPRS.highC)
        return 'C';
    if (q30 <= exports.LPRS.lowS && r30 <= exports.STS.down)
        return 'S';
    if (q30 <= exports.LPRS.lowA)
        return 'A';
    return 'B';
}
function classifyModifier(m30) {
    if (m30 <= exports.LPRS.strongDown)
        return '↓↓';
    if (m30 <= exports.LPRS.weakDown)
        return '↓';
    if (m30 < exports.LPRS.weakUp)
        return '→';
    if (m30 < exports.LPRS.strongUp)
        return '↑';
    return '↑↑';
}
function classifyConfidence(n, cv) {
    if (n < exports.LPRS.minSamples || cv > exports.LPRS.cvPoor)
        return '低';
    if (n < exports.LPRS.fullSamples || cv > exports.LPRS.cvGood)
        return '中';
    return '高';
}
/**
 * 长期价格区间标准（LPRS，30 日）。
 * 四个维度缺一不可：基准偏离、历史分位、趋势斜率、波动。
 */
function computeLong(raw) {
    const points = sortPoints(raw);
    const win = windowOf(points, 30);
    const n30 = win.length;
    const empty = {
        available: false, n30, ma30: 0, r30: 0, q30: 0.5, m30: 0, cv30: 0,
        grade: 'B', modifier: '→', confidence: '低',
    };
    if (n30 < 2)
        return empty;
    const prices = win.map((p) => p.price);
    const current = prices[prices.length - 1];
    const ma30 = (0, constants_1.mean)(prices);
    const r30 = ma30 ? current / ma30 - 1 : 0;
    const q30 = percentileRank(current, prices);
    const cv30 = ma30 ? (0, constants_1.stdev)(prices) / ma30 : 0;
    // x 用「距首日的天数偏移」，避免 YYYYMMDD 数值过大导致斜率量级失真
    const origin = win[0].day;
    const xs = win.map((p) => p.day - origin);
    const beta = theilSen(xs, prices);
    const m30 = ma30 ? (beta * 30) / ma30 : 0;
    return {
        available: n30 >= exports.LPRS.minSamples,
        n30,
        ma30: Math.round(ma30),
        r30: (0, constants_1.round)(r30, 4),
        q30: (0, constants_1.round)(q30, 4),
        m30: (0, constants_1.round)(m30, 4),
        cv30: (0, constants_1.round)(cv30, 4),
        grade: classifyGrade(q30, r30),
        modifier: classifyModifier(m30),
        confidence: classifyConfidence(n30, cv30),
    };
}
/**
 * 品类指数：等权几何平均，以首采价为 100。
 * 几何平均可避免高价型号（显卡）主导指数。
 */
function categoryIndex(pairs) {
    const valid = pairs.filter((p) => p.base > 0 && p.current > 0);
    if (!valid.length)
        return 100;
    const sum = valid.reduce((acc, p) => acc + Math.log(p.current / p.base), 0);
    return (0, constants_1.round)(100 * Math.exp(sum / valid.length), 2);
}
/** 从价格序列里取某型号的「代表价」：默认中位数，offer 数≥3 时用截尾均值 */
function representativePrice(prices) {
    if (!prices.length)
        return 0;
    if (prices.length <= 2)
        return Math.round((0, constants_1.median)(prices));
    const sorted = [...prices].sort((a, b) => a - b).slice(1, -1);
    return Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
}
//# sourceMappingURL=index.js.map