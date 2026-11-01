"use strict";
/**
 * 性能基准与性价比。
 *
 * 为什么需要一份「内置分数表」：价格 API 只给价格，**没有性能**。
 * 性价比 = 性能 / 价格，没有性能分就算不出来。所以这里内置一份可维护的参考分，
 * 并明确标注它是**参考值**（3DMark Time Spy 显卡分，近似取值，可手工修订）。
 *
 * 内存/固态不用性能分，直接用「每 GB 价格」，这才是这两个品类真正有意义的性价比。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreOfGpu = scoreOfGpu;
exports.capacityOf = capacityOf;
exports.gpuValue = gpuValue;
exports.capacityValue = capacityValue;
/** 显卡参考分（近似值，来源：公开跑分中位数，2026-10 整理） */
const GPU_BENCH = [
    { match: 'RTX 5090', score: 48000 },
    { match: 'RTX 5080', score: 32000 },
    { match: 'RTX 5070 Ti', score: 24500 },
    { match: 'RTX 5070', score: 21000 },
    { match: 'RTX 5060 Ti', score: 16000 },
    { match: 'RTX 5060', score: 13500 },
    { match: 'RTX 4090', score: 36000 },
    { match: 'RTX 4080', score: 28000 },
    { match: 'RTX 4070 Ti', score: 23000 },
    { match: 'RTX 4070', score: 18000 },
    { match: 'RTX 4060 Ti', score: 13500 },
    { match: 'RTX 4060', score: 11000 },
    { match: 'RTX 3090', score: 20000 },
    { match: 'RTX 3080', score: 17500 },
    { match: 'RTX 3070', score: 13500 },
    { match: 'RTX 3060 Ti', score: 11500 },
    { match: 'RTX 3060', score: 9000 },
    { match: 'RX 9070 XT', score: 26000 },
    { match: 'RX 9070', score: 22500 },
    { match: 'RX 9060 XT', score: 15500 },
    { match: 'RX 7900 XTX', score: 29000 },
    { match: 'RX 7900 XT', score: 26000 },
    { match: 'RX 7800 XT', score: 19000 },
    { match: 'RX 7700 XT', score: 17000 },
    { match: 'RX 7600', score: 11000 },
    { match: 'Arc B580', score: 12500 },
    { match: 'Arc B570', score: 11000 },
    { match: 'Arc A770', score: 13000 },
];
/** 找型号对应的性能分；认不出返回 null（不瞎猜） */
function scoreOfGpu(name) {
    const upper = name.toUpperCase();
    // 先匹配更长的关键字，避免 "RTX 5070" 抢走 "RTX 5070 Ti"
    const sorted = [...GPU_BENCH].sort((a, b) => b.match.length - a.match.length);
    for (const row of sorted) {
        if (upper.includes(row.match.toUpperCase()))
            return row.score;
    }
    return null;
}
/** 从型号名里抠容量（GB）：16G / 16GB / 1TB / 2T 都认 */
function capacityOf(name) {
    const tb = name.match(/(\d+(?:\.\d+)?)\s*T(?:B)?\b/i);
    if (tb)
        return Number(tb[1]) * 1024;
    const gb = name.match(/(\d+)\s*G(?:B)?\b/i);
    if (gb)
        return Number(gb[1]);
    return null;
}
/** 显卡性价比：每 100 元买到多少性能分 */
function gpuValue(name, priceYuan) {
    const score = scoreOfGpu(name);
    if (!score || !priceYuan)
        return null;
    return {
        name,
        price: priceYuan,
        metric: score,
        value: (score / priceYuan) * 100,
        higherIsBetter: true,
        unit: '分/百元',
    };
}
/** 内存/固态性价比：每 GB 多少钱（越低越好） */
function capacityValue(name, priceYuan, unit = 'GB') {
    const capacity = capacityOf(name);
    if (!capacity || !priceYuan)
        return null;
    return {
        name,
        price: priceYuan,
        metric: capacity,
        value: priceYuan / capacity,
        higherIsBetter: false,
        unit: `元/${unit}`,
    };
}
//# sourceMappingURL=bench.js.map