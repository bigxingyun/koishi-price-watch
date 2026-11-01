"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCollect = runCollect;
const constants_1 = require("../constants");
const adapters_1 = require("../adapters");
const repo = __importStar(require("../store/repo"));
const one_1 = require("../collect/one");
const quote_1 = require("../domain/quote");
const constants_2 = require("../constants");
const aggregate_1 = require("../store/aggregate");
const fetcher_1 = require("./fetcher");
const guard_1 = require("./guard");
const normalize_1 = require("./normalize");
/**
 * 单轮采集。
 *
 * 关键约束（设计文档 §1.3）：
 * - 平台之间并行、平台内部串行（并发是风控第一触发因素）
 * - 每个请求前过守卫（日硬闸 + 熔断），请求后计数
 * - 命中登录/验证 → 立即熔断该平台 24h，不再继续撞
 * - 同一 (offerId, day) 已有成功记录 → 跳过（幂等）
 */
async function runCollect(ctx, config, options = {}) {
    const started = Date.now();
    const day = options.day ?? (0, constants_1.toDay)();
    const logger = ctx.logger('price-watch');
    const models = await repo.listModels(ctx);
    const modelMap = new Map(models.map((m) => [m.id, m]));
    const enabledCategories = new Set(config.basic.categories);
    const offers = (await repo.listOffers(ctx))
        .filter((offer) => offer.active)
        .filter((offer) => {
        const model = modelMap.get(offer.modelId);
        return model ? enabledCategories.has(model.category) : false;
    })
        .filter((offer) => !options.platforms?.length || options.platforms.includes(offer.platform))
        .slice(0, config.collect.maxOffers);
    const todaySnapshots = await repo.getSnapshots(ctx, [...new Set(offers.map((o) => o.modelId))], day);
    const doneKey = new Set(todaySnapshots.filter((s) => s.status === constants_1.STATUS.OK).map((s) => `${s.offerId}:${s.day}`));
    // 采集撞到登录墙时自动发起登录，省得用户再手动发一次指令
    const promptedAuth = new Set();
    // 本轮内已确认需要登录的平台：同轮不再尝试
    const authBlocked = new Set();
    const byPlatform = new Map();
    for (const offer of offers) {
        const list = byPlatform.get(offer.platform) ?? [];
        list.push(offer);
        byPlatform.set(offer.platform, list);
    }
    const result = {
        day, total: offers.length, ok: 0, failed: 0, skipped: 0,
        skipReasons: { noItemId: 0, alreadyDone: 0, manual: 0 },
        notes: [],
        platforms: {}, rebuilt: { daily: 0, stat: 0 }, elapsedMs: 0,
    };
    await Promise.all([...byPlatform.entries()].map(async ([platform, list]) => {
        const stat = { ok: 0, failed: 0, skipped: 0 };
        result.platforms[platform] = stat;
        const adapter = (0, adapters_1.getAdapter)(platform);
        if (!adapter) {
            stat.blocked = '未接入该平台的适配器';
            stat.skipped += list.length;
            result.skipped += list.length;
            return;
        }
        const decision = await (0, guard_1.checkGuard)(ctx, platform, config.collect.dailyCap, day);
        if (!decision.ok) {
            stat.blocked = decision.reason;
            stat.skipped += list.length;
            result.skipped += list.length;
            logger.warn('%s', decision.reason);
            return;
        }
        for (const offer of list) {
            if (authBlocked.has(platform))
                break;
            // 没有可用的商品 ID（演示数据 / 只做过人工录入）→ 不计失败，直接跳过
            const crawlable = offer.platform === 'manual' || /\d{6,}/.test(offer.itemId);
            if (!crawlable) {
                logger.debug('跳过 %s/%s：itemId 无 6 位数字', offer.platform, offer.itemId);
                result.skipReasons.noItemId++;
                stat.skipped++;
                result.skipped++;
                continue;
            }
            if (!options.force && doneKey.has(`${offer.id}:${day}`)) {
                logger.debug('跳过 %s/%s：今日已完成', offer.platform, offer.itemId);
                result.skipReasons.alreadyDone++;
                stat.skipped++;
                result.skipped++;
                continue;
            }
            if (options.onlyMissing && doneKey.has(`${offer.id}:${day}`)) {
                result.skipReasons.alreadyDone++;
                stat.skipped++;
                result.skipped++;
                continue;
            }
            const model = modelMap.get(offer.modelId);
            if (!model)
                continue;
            const gate = await (0, guard_1.checkGuard)(ctx, platform, config.collect.dailyCap, day);
            if (!gate.ok) {
                stat.blocked = gate.reason;
                break;
            }
            await (0, guard_1.incrCount)(ctx, platform, day);
            // 采集一个报价：数据源决策 + 提供者调用 + 结果归一，全部在 collectOne 里
            const outcome = await (0, one_1.collectOne)({ ctx, config, offer, model, day });
            logger.info('%s %s → %s（%sms）', platform, offer.itemId, (0, quote_1.describeResult)(outcome), outcome.costMs ?? 0);
            if (outcome.status === 'auth_required') {
                // 「需要登录」不是故障：不能拿它触发 24 小时熔断，
                // 否则会变成「要登录 → 熔断 → 采集被挡 → 又要登录」的死锁。
                // 连续撞登录墙 = 风控在升级，停下来冷却，别把账号刷成黑名单
                const key = `authStreak:${platform}`;
                const streak = (Number(await repo.metaGet(ctx, key)) || 0) + 1;
                await repo.metaSet(ctx, key, String(streak));
                if (streak >= 3) {
                    await (0, guard_1.blockPlatform)(ctx, platform, 1, '连续 3 次要求登录，暂停 1 小时冷却（避免被风控踢号）');
                    result.notes.push(`${platform} 连续 ${streak} 次要求登录，已暂停 1 小时；冷却后重新登录再采`);
                }
                if (!promptedAuth.has(platform) && config.collect.browserEnabled) {
                    promptedAuth.add(platform);
                    const ticket = await Promise.resolve().then(() => __importStar(require('../auth/wizard'))).then((mod) => mod.startSingle(ctx, config, platform))
                        .catch(() => null);
                    if (ticket)
                        result.notes.push(`${platform} 需要登录，二维码已经发出来了，扫完再采一次即可`);
                }
                // 本轮内该平台不再继续尝试，避免连撞同一堵墙
                authBlocked.add(platform);
                stat.failed++;
                result.failed++;
                continue;
            }
            if (outcome.ok) {
                // 偏离历史中位数太多 → 标可疑，不污染报表
                const history = await repo.getRecentSnapshots(ctx, day - 30).catch(() => []);
                const past = history
                    .filter((s) => s.modelId === model.id && s.status === constants_1.STATUS.OK)
                    .map((s) => s.price / 100);
                const outlier = (0, quote_1.priceOutlier)(past, outcome.price ?? 0);
                if (outlier.outlier) {
                    await persist(ctx, offer, day, { price: 0, status: constants_1.STATUS.SUSPICIOUS, note: outlier.reason });
                    stat.failed++;
                    result.failed++;
                    logger.warn('%s %s 价格可疑：%s', platform, offer.itemId, outlier.reason);
                    continue;
                }
                await persist(ctx, offer, day, {
                    price: (0, constants_2.toCents)(outcome.price ?? 0),
                    status: constants_1.STATUS.OK,
                    note: outcome.evidence,
                });
                await repo.metaDel(ctx, `authFail:${platform}`);
                await repo.metaDel(ctx, `authStreak:${platform}`).catch(() => undefined);
                stat.ok++;
                result.ok++;
            }
            else {
                await persist(ctx, offer, day, {
                    price: 0,
                    status: (0, quote_1.statusCodeOf)(outcome.status),
                    note: outcome.reason,
                });
                stat.failed++;
                result.failed++;
                logger.warn('%s %s 采集失败[%s]：%s', platform, offer.itemId, outcome.status, outcome.reason);
            }
            const gap = config.collect.intervalSeconds * 1000;
            await (0, fetcher_1.sleep)((0, fetcher_1.jitter)(gap * 0.7, gap * 1.3));
        }
    }));
    if (result.ok > 0 || result.failed > 0) {
        result.rebuilt.daily = await (0, aggregate_1.rebuildDaily)(ctx, { sinceDay: day, today: day });
        result.rebuilt.stat = await (0, aggregate_1.rebuildStat)(ctx, { today: day });
    }
    result.elapsedMs = Date.now() - started;
    logger.info('采集完成：%d 成功 / %d 失败 / %d 跳过，用时 %d s（%s）', result.ok, result.failed, result.skipped, Math.round(result.elapsedMs / 1000), Object.entries(result.platforms).map(([p, s]) => `${p}:${s.ok}✓${s.failed}✗`).join(' '));
    return result;
}
async function persist(ctx, offer, day, quote) {
    // 质量防线：价格相对上一次成功价偏离 >50% 时标可疑，仍保留记录但不参与代表价
    let status = quote.status;
    if (status === constants_1.STATUS.OK) {
        const last = await repo.getLastOkPrice(ctx, offer.id, day);
        if (last && (0, normalize_1.isSuspicious)(quote.price, last))
            status = constants_1.STATUS.SUSPICIOUS;
    }
    await repo.upsertSnapshot(ctx, {
        offerId: offer.id,
        modelId: offer.modelId,
        day,
        price: quote.price,
        listPrice: quote.listPrice ?? quote.price,
        status,
        samples: 1,
    });
}
//# sourceMappingURL=collect.js.map