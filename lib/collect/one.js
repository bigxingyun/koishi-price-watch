"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectOne = collectOne;
const api_1 = require("../api");
const source_1 = require("../collect/source");
const adapters_1 = require("../adapters");
const quote_1 = require("../domain/quote");
async function collectOne(input) {
    const { ctx, config, offer, model, day } = input;
    const platform = offer.platform;
    const started = Date.now();
    const decision = await (0, source_1.resolveSource)(ctx, config, platform);
    if (decision.source === 'manual') {
        return {
            ok: false,
            status: 'parse_failed',
            source: 'manual',
            reason: `人工模式不采集（${decision.reason}）`,
            costMs: 0,
        };
    }
    if (decision.source === 'api') {
        const outcome = await (0, api_1.apiPrice)(ctx, config, platform, offer.itemId);
        if (!outcome.ok || !outcome.price) {
            return {
                ok: false,
                status: 'parse_failed',
                source: 'api',
                reason: outcome.message,
                evidence: decision.reason,
                costMs: Date.now() - started,
            };
        }
        // API 返回的价格同样要过质量闸门（联盟接口也会给出 0.01 这种占位价）
        if (!(0, quote_1.priceLooksSane)(outcome.price.price)) {
            return {
                ok: false,
                status: 'suspicious',
                source: 'api',
                reason: `API 返回的价格不合理（${outcome.price.price} 元），已拦下`,
                evidence: outcome.price.note,
                costMs: Date.now() - started,
            };
        }
        return {
            ok: true,
            price: Number(outcome.price.price.toFixed(2)),
            status: 'ok',
            source: 'api',
            shopName: outcome.price.shopName,
            title: outcome.price.title,
            evidence: outcome.price.note,
            costMs: Date.now() - started,
        };
    }
    const adapter = (0, adapters_1.getAdapter)(platform);
    if (!adapter) {
        return {
            ok: false,
            status: 'parse_failed',
            source: 'browser',
            reason: `平台 ${platform} 没有适配器`,
            costMs: Date.now() - started,
        };
    }
    try {
        const quote = await adapter.fetch({ ctx, config, offer, model, day });
        return (0, quote_1.fromQuote)(quote, 'browser', Date.now() - started);
    }
    catch (error) {
        const { status, reason } = (0, quote_1.classifyError)(error);
        return {
            ok: false,
            status,
            source: 'browser',
            reason,
            evidence: decision.reason,
            costMs: Date.now() - started,
        };
    }
}
//# sourceMappingURL=one.js.map