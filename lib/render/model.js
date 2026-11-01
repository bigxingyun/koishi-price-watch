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
exports.REPORT_META = exports.PLATFORM_LABEL = void 0;
exports.parsePlatform = parsePlatform;
exports.buildDigest = buildDigest;
exports.seriesOf = seriesOf;
const constants_1 = require("../constants");
const analytics_1 = require("../analytics");
const repo = __importStar(require("../store/repo"));
exports.PLATFORM_LABEL = {
    jd: '京东',
    taobao: '淘宝',
    pdd: '拼多多',
    manual: '人工',
    mock: '演示',
};
exports.REPORT_META = {
    daily: { label: '本日', changeLabel: '单日', windowDays: 1, title: '硬件价格日报' },
    weekly: { label: '近 7 日', changeLabel: '本周', windowDays: 7, title: '硬件价格周报' },
    monthly: { label: '近 30 日', changeLabel: '本月', windowDays: 30, title: '硬件价格月报' },
};
function zoneOf(q30) {
    if (q30 <= 0.2)
        return '低位';
    if (q30 <= 0.35)
        return '偏低';
    if (q30 < 0.65)
        return '常态';
    if (q30 < 0.8)
        return '偏高';
    return '高位';
}
function classifyPeriod(r) {
    if (r >= 0.08)
        return '急涨';
    if (r >= 0.03)
        return '上涨';
    if (r > -0.03)
        return '横盘';
    if (r > -0.08)
        return '下跌';
    return '急跌';
}
/** 周期内连续同向天数（末段） */
function streakOf(points) {
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
function statsOf(points, openOverride) {
    if (!points.length)
        return { open: 0, close: 0, change: 0, high: 0, low: 0, pos: 0.5 };
    const open = openOverride ?? points[0].price;
    const close = points[points.length - 1].price;
    const prices = points.map((p) => p.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    return {
        open,
        close,
        change: open ? close / open - 1 : 0,
        high,
        low,
        pos: high === low ? 0.5 : (close - low) / (high - low),
    };
}
/** 解析平台别名（中文/英文/简写都能认） */
function parsePlatform(input) {
    if (!input)
        return 'all';
    const text = input.trim().toLowerCase();
    if (['jd', '京东', 'jingdong'].includes(text))
        return 'jd';
    if (['taobao', 'tb', '淘宝', '天猫', 'tmall'].includes(text))
        return 'taobao';
    if (['pdd', '拼多多', 'pinduoduo'].includes(text))
        return 'pdd';
    if (['manual', '人工'].includes(text))
        return 'manual';
    if (['all', '全部', '全平台', '所有'].includes(text))
        return 'all';
    return text;
}
/**
 * 组装报表数据模型。
 *
 * 相比早期版本的两个关键变化：
 * - `kind`：日报 / 周报 / 月报（滚动 1 / 7 / 30 日），周期语义贯穿所有字段
 * - `platform`：只看单个平台时，代表价只由该平台的报价聚合，比价段自动隐藏
 *
 * 指标全部在内存里按需计算（几十型号 × 百余天）。
 * 好处是「周期 × 平台」的组合天然成立，不必为每种组合预建聚合表；
 * `pw_daily` / `pw_stat` 仍然保留，给需要毫秒级响应的单型号查询用。
 */
async function buildDigest(ctx, config, options = {}) {
    const started = Date.now();
    const kind = options.kind ?? 'daily';
    const platform = options.platform ?? 'all';
    const meta = exports.REPORT_META[kind];
    const day = options.day ?? (0, constants_1.toDay)();
    const windowDays = meta.windowDays;
    const topMovers = options.topMovers ?? config.basic.topMovers;
    const maxWatch = options.maxWatch ?? config.basic.maxWatchItems;
    const threshold = options.compareThreshold ?? config.basic.compareThreshold;
    const startDay = (0, constants_1.shiftDay)(day, -(windowDays - 1));
    const prevEnd = (0, constants_1.shiftDay)(startDay, -1);
    const prevStart = (0, constants_1.shiftDay)(prevEnd, -(windowDays - 1));
    const lookback = (0, constants_1.shiftDay)(prevStart, -31);
    const models = await repo.listModels(ctx);
    const offers = await repo.listOffers(ctx);
    const offerMap = new Map(offers.map((o) => [o.id, o]));
    const activeOffers = (platform === 'all' ? offers : offers.filter((o) => o.platform === platform))
        .filter((o) => o.active);
    const snapshots = await repo.getSnapshots(ctx, models.map((m) => m.id), lookback);
    // modelId → day → 该平台（或全平台）的价格集合
    const byModelDay = new Map();
    for (const snap of snapshots) {
        if (snap.status !== 0 || !snap.price)
            continue;
        const offer = offerMap.get(snap.offerId);
        if (!offer)
            continue;
        if (platform !== 'all' && offer.platform !== platform)
            continue;
        let byDay = byModelDay.get(snap.modelId);
        if (!byDay)
            byModelDay.set(snap.modelId, (byDay = new Map()));
        const list = byDay.get(snap.day) ?? [];
        list.push(snap.price);
        byDay.set(snap.day, list);
    }
    const seriesByModel = new Map();
    for (const [modelId, byDay] of byModelDay) {
        const points = [...byDay.entries()]
            .map(([d, prices]) => ({ day: d, price: (0, analytics_1.representativePrice)(prices) }))
            .sort((a, b) => a.day - b.day);
        seriesByModel.set(modelId, points);
    }
    const inRange = (points, from, to) => points.filter((p) => p.day >= from && p.day <= to);
    // 每个型号每个平台最近一次价格（用于比价与「三平台报价」）
    const latestByPlatform = new Map();
    for (const snap of snapshots) {
        const offer = offerMap.get(snap.offerId);
        if (!offer || snap.status !== 0 || !snap.price)
            continue;
        if (snap.day < (0, constants_1.shiftDay)(day, -3))
            continue;
        let map = latestByPlatform.get(snap.modelId);
        if (!map)
            latestByPlatform.set(snap.modelId, (map = new Map()));
        const prev = map.get(offer.platform);
        if (!prev || prev.day < snap.day) {
            map.set(offer.platform, { price: snap.price, day: snap.day, shop: offer.shopName });
        }
    }
    const PLATFORM_ORDER = ['jd', 'taobao', 'pdd'];
    const offersOf = (modelId) => {
        const map = latestByPlatform.get(modelId);
        if (!map)
            return [];
        const present = [...map.keys()];
        const ordered = [
            ...PLATFORM_ORDER.filter((p) => present.includes(p)),
            ...present.filter((p) => !PLATFORM_ORDER.includes(p)).sort(),
        ];
        return ordered.map((p) => ({
            platform: p,
            label: exports.PLATFORM_LABEL[p] ?? p,
            price: map.get(p).price,
            shopName: map.get(p).shop,
        }));
    };
    const buildItem = (model) => {
        const points = seriesByModel.get(model.id) ?? [];
        if (!points.length)
            return null;
        const current = inRange(points, startDay, day);
        if (!current.length)
            return null;
        const prev = inRange(points, prevStart, prevEnd);
        // 日报的窗口只有 1 天，期初必须取「窗口前最近一个点」，否则 open==close，涨跌恒为 0
        const before = points.filter((p) => p.day < startDay);
        const openPoint = current.length > 1 ? current[0] : (before[before.length - 1] ?? current[0]);
        const stats = statsOf(current, openPoint.price);
        const prevStats = windowDays > 1 && prev.length ? statsOf(prev) : null;
        const long = (0, analytics_1.computeLong)(points.slice(-30));
        const lastTwo = points.slice(-2);
        const d1 = lastTwo.length === 2 && lastTwo[0].price
            ? lastTwo[1].price / lastTwo[0].price - 1
            : 0;
        return {
            modelId: model.id,
            name: model.name,
            category: model.category,
            price: stats.close,
            open: stats.open,
            high: stats.high,
            low: stats.low,
            change: (0, constants_1.round)(stats.change, 4),
            prevChange: prevStats ? (0, constants_1.round)(prevStats.change, 4) : null,
            d1: (0, constants_1.round)(d1, 4),
            pos: (0, constants_1.round)(stats.pos, 4),
            streak: streakOf(current),
            label: classifyPeriod(stats.change),
            grade: long.grade,
            modifier: long.modifier,
            confidence: long.confidence,
            r30: long.r30,
            q30: long.q30,
            offers: offersOf(model.id),
            trend: current.slice(-30).map((p) => p.price),
            degrade: long.n30 < 21
                ? { kind: 'coldstart', detail: `长期数据积累中 ${long.n30}/30 日` }
                : undefined,
        };
    };
    const allItems = models
        .map((m) => buildItem(m))
        .filter((x) => x !== null);
    const movers = [...allItems]
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, topMovers);
    // 品类指数：等权几何平均，各型号以自身首采价为 100
    const indexes = [];
    for (const category of ['gpu', 'ram', 'ssd']) {
        const members = models.filter((m) => m.category === category && m.inIndex);
        if (!members.length)
            continue;
        const levelAt = (targetDay) => {
            const pairs = [];
            for (const m of members) {
                const points = seriesByModel.get(m.id) ?? [];
                if (!points.length)
                    continue;
                let value = null;
                for (const p of points) {
                    if (p.day <= targetDay)
                        value = p.price;
                    else
                        break;
                }
                if (value)
                    pairs.push({ base: points[0].price, current: value });
            }
            if (!pairs.length)
                return null;
            const sum = pairs.reduce((acc, p) => acc + Math.log(p.current / p.base), 0);
            return 100 * Math.exp(sum / pairs.length);
        };
        const closeLevel = levelAt(day);
        // 日报（窗口 1 天）用昨天的指数水平当基期，否则恒定 0%
        const openLevel = levelAt(windowDays === 1 ? prevEnd : startDay);
        if (!closeLevel || !openLevel)
            continue;
        const prevClose = levelAt(prevEnd);
        const prevOpen = levelAt(prevStart);
        const history = [];
        for (let i = 29; i >= 0; i--) {
            const level = levelAt((0, constants_1.shiftDay)(day, -i));
            if (level)
                history.push(level);
        }
        const q30 = (0, analytics_1.percentileRank)(closeLevel, history);
        const avg = history.reduce((a, b) => a + b, 0) / (history.length || 1);
        indexes.push({
            category,
            label: constants_1.CATEGORY_LABEL[category],
            value: (0, constants_1.round)(closeLevel, 2),
            change: (0, constants_1.round)(closeLevel / openLevel - 1, 4),
            prevChange: prevClose && prevOpen ? (0, constants_1.round)(prevClose / prevOpen - 1, 4) : null,
            q30: (0, constants_1.round)(q30, 4),
            zone: zoneOf(q30),
            r30: avg ? (0, constants_1.round)(closeLevel / avg - 1, 4) : 0,
        });
    }
    // 比价只在全平台模式下有意义
    const compare = [];
    if (platform === 'all') {
        for (const item of allItems) {
            const prices = item.offers.filter((o) => o.price !== null);
            if (prices.length < 2)
                continue;
            const values = prices.map((o) => o.price);
            const min = Math.min(...values);
            const max = Math.max(...values);
            if (!min)
                continue;
            const spread = max / min - 1;
            if (spread < threshold)
                continue;
            const lowest = prices.find((o) => o.price === min).label;
            compare.push({ name: item.name, items: item.offers, spread: (0, constants_1.round)(spread, 4), lowest });
        }
        compare.sort((a, b) => b.spread - a.spread);
    }
    const watch = (options.watchIds ?? [])
        .map((id) => allItems.find((i) => i.modelId === id))
        .filter((x) => !!x)
        .slice(0, maxWatch);
    // 采集健康度：按窗口末日实际拿到数据的报价数算
    const lastDayByOffer = new Map();
    for (const snap of snapshots) {
        if (snap.status !== 0)
            continue;
        const prev = lastDayByOffer.get(snap.offerId) ?? 0;
        if (snap.day > prev)
            lastDayByOffer.set(snap.offerId, snap.day);
    }
    const latestDay = lastDayByOffer.size ? Math.max(...lastDayByOffer.values()) : 0;
    const okCount = activeOffers.filter((o) => lastDayByOffer.get(o.id) === latestDay).length;
    const firstDayText = await repo.metaGet(ctx, 'firstDay');
    const baseDay = Number(firstDayText) || startDay;
    const platformLabel = platform === 'all' ? '全平台' : (exports.PLATFORM_LABEL[platform] ?? platform);
    const rangeText = windowDays === 1
        ? (0, constants_1.formatDay)(day)
        : `${(0, constants_1.formatDay)(startDay)} — ${(0, constants_1.formatDay)(day)}`;
    return {
        day,
        dateText: (0, constants_1.formatDay)(day),
        issue: (0, constants_1.issueNo)(day, baseDay),
        period: {
            kind,
            label: meta.label,
            changeLabel: meta.changeLabel,
            title: meta.title,
            startDay,
            endDay: day,
            rangeText,
            platform,
            platformLabel,
        },
        health: {
            total: activeOffers.length,
            ok: okCount,
            failed: Math.max(0, activeOffers.length - okCount),
        },
        indexes,
        items: [...allItems].sort((a, b) => b.price - a.price),
        movers,
        compare: compare.slice(0, 2),
        watch,
        footer: { models: models.length, quotes: okCount, costMs: options.costMs ?? Date.now() - started },
        theme: config.basic.theme,
        colorScheme: config.basic.colorScheme,
    };
}
/** 取某型号一段时间内的价格序列（trend 指令与单平台模式用） */
async function seriesOf(ctx, modelId, days, platform = 'all') {
    const today = (0, constants_1.toDay)();
    const since = (0, constants_1.shiftDay)(today, -(days - 1));
    const offers = (await repo.listOffers(ctx, modelId))
        .filter((o) => platform === 'all' || o.platform === platform);
    const offerIds = new Set(offers.map((o) => o.id));
    const snapshots = await repo.getSnapshots(ctx, [modelId], since);
    const byDay = new Map();
    for (const snap of snapshots) {
        if (snap.status !== 0 || !snap.price)
            continue;
        if (!offerIds.has(snap.offerId))
            continue;
        const list = byDay.get(snap.day) ?? [];
        list.push(snap.price);
        byDay.set(snap.day, list);
    }
    return [...byDay.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, prices]) => (0, analytics_1.representativePrice)(prices));
}
//# sourceMappingURL=model.js.map