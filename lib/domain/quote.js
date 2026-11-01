"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRICE_CEIL_YUAN = exports.PRICE_FLOOR_YUAN = void 0;
exports.priceLooksSane = priceLooksSane;
exports.statusCodeOf = statusCodeOf;
exports.classifyError = classifyError;
exports.fromQuote = fromQuote;
exports.toSnapshotRow = toSnapshotRow;
exports.describeResult = describeResult;
exports.priceOutlier = priceOutlier;
exports.modelMatches = modelMatches;
const constants_1 = require("../constants");
const types_1 = require("../crawler/types");
exports.PRICE_FLOOR_YUAN = 1;
exports.PRICE_CEIL_YUAN = 200_000;
/** 价格本身是否像一个正常价格（不合法就绝不入库） */
function priceLooksSane(priceYuan) {
    if (!Number.isFinite(priceYuan))
        return false;
    if (priceYuan < exports.PRICE_FLOOR_YUAN || priceYuan > exports.PRICE_CEIL_YUAN)
        return false;
    // 12 位以上的数字通常是 ID 被误当价格
    return priceYuan < 1e9;
}
/** 失败状态 → 数据库里的 status 数字 */
function statusCodeOf(status) {
    switch (status) {
        case 'ok':
            return constants_1.STATUS.OK;
        case 'out_of_stock':
            return constants_1.STATUS.OUT_OF_STOCK;
        case 'delisted':
            return constants_1.STATUS.DELISTED;
        case 'suspicious':
            return constants_1.STATUS.SUSPICIOUS;
        default:
            return constants_1.STATUS.FAILED;
    }
}
/**
 * 异常 → 统一状态。这是「一眼看出为什么失败」的核心：
 * 任何适配器只要按约定抛这三种错，这里就会给出确定的分类。
 */
function classifyError(error) {
    const message = error?.message ?? String(error);
    if (error instanceof types_1.AuthError)
        return { status: 'auth_required', reason: message };
    if (error instanceof types_1.ParseError)
        return { status: 'parse_failed', reason: message };
    if (/风控|blocked|封|验证码|captcha|403/i.test(message))
        return { status: 'blocked', reason: message };
    if (/timeout|ETIMEDOUT|ECONNRESET|网络/i.test(message))
        return { status: 'parse_failed', reason: `网络失败：${message}` };
    return { status: 'parse_failed', reason: message };
}
/** 把适配器返回的 Quote（分）转成领域层的 QuoteResult（元） */
function fromQuote(quote, source, costMs) {
    const priceYuan = quote.price / 100;
    const statusMap = {
        [constants_1.STATUS.OK]: 'ok',
        [constants_1.STATUS.OUT_OF_STOCK]: 'out_of_stock',
        [constants_1.STATUS.DELISTED]: 'delisted',
        [constants_1.STATUS.SUSPICIOUS]: 'suspicious',
        [constants_1.STATUS.FAILED]: 'parse_failed',
    };
    const status = statusMap[quote.status] ?? 'parse_failed';
    if (status === 'ok' && !priceLooksSane(priceYuan)) {
        return {
            ok: false,
            status: 'suspicious',
            source,
            costMs,
            reason: `价格不合理（${priceYuan} 元），已拦下不入库`,
            evidence: quote.note,
        };
    }
    return {
        ok: status === 'ok',
        price: status === 'ok' ? Number(priceYuan.toFixed(2)) : undefined,
        listPrice: quote.listPrice ? Number((quote.listPrice / 100).toFixed(2)) : undefined,
        status,
        source,
        reason: status === 'ok' ? undefined : quote.note,
        evidence: quote.note,
        costMs,
    };
}
/** 成功结果 → 写库用的行（唯一出口，避免各处自己算分） */
function toSnapshotRow(result, offerId, modelId, day) {
    return {
        offerId,
        modelId,
        day,
        price: result.ok && result.price ? (0, constants_1.toCents)(result.price) : 0,
        listPrice: result.listPrice ? (0, constants_1.toCents)(result.listPrice) : 0,
        status: statusCodeOf(result.status),
        samples: 1,
    };
}
/** 无副作用的诊断行，用于日志与自检 */
function describeResult(result) {
    const where = result.source;
    if (result.ok)
        return `${where} 成功 ¥${result.price?.toFixed(0) ?? '?'}`;
    return `${where} 失败[${result.status}] ${result.reason ?? ''}`;
}
function priceOutlier(history, priceYuan, threshold = 0.6) {
    const clean = history.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    if (clean.length < 3)
        return { outlier: false, median: 0, deviation: 0 };
    const mid = Math.floor(clean.length / 2);
    const median = clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
    if (!median)
        return { outlier: false, median: 0, deviation: 0 };
    const deviation = (priceYuan - median) / median;
    if (Math.abs(deviation) <= threshold)
        return { outlier: false, median, deviation };
    const sign = deviation > 0 ? "+" : "";
    const percent = sign + (deviation * 100).toFixed(0) + "%";
    return {
        outlier: true,
        median,
        deviation,
        reason: "本次 " + priceYuan + " 元偏离最近中位价 " + Math.round(median) + " 元（" + percent + "），超出 " + (threshold * 100) + "% 阈值",
    };
}
const CODE_RE = /\b(?:rtx|gtx|rx|arc)?\s*(\d{4})\s*(ti|super|xt|xtx|gre)?\b/gi;
function codesOf(text) {
    const out = [];
    let m;
    const re = new RegExp(CODE_RE.source, "gi");
    while ((m = re.exec(text))) {
        const num = m[1];
        const suffix = (m[2] || "").toLowerCase();
        if (!num)
            continue;
        out.push(suffix ? num + suffix : num);
    }
    return out;
}
function modelMatches(expectedName, actualText) {
    const expectedCodes = codesOf(expectedName);
    const actualCodes = codesOf(actualText);
    if (!expectedCodes.length)
        return { matches: true, expected: expectedName, found: actualCodes };
    // 目标型号的每个代号都必须出现在标题里（5070ti 要求 ti 也在）
    const missing = expectedCodes.filter((code) => !actualCodes.includes(code));
    if (!missing.length)
        return { matches: true, expected: expectedName, found: actualCodes };
    return {
        matches: false,
        expected: expectedName,
        found: actualCodes,
        reason: "页面标题是 " + actualCodes.slice(0, 3).join("/") + "，与目标 " + expectedCodes.join("/") + " 不符（疑似低价引流）",
    };
}
//# sourceMappingURL=quote.js.map