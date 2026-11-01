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
exports.gc = gc;
exports.stats = stats;
const constants_1 = require("../constants");
const repo_1 = require("./repo");
const repo = __importStar(require("./repo"));
/** 按天窗口分批删除，避免一条 DELETE 扫全表把数据库锁住 */
async function deleteByDayRange(ctx, table, fromDay, toDay_, batchDays) {
    let deleted = 0;
    let cursor = fromDay;
    while (cursor < toDay_) {
        const end = Math.min(toDay_, (0, constants_1.shiftDay)(cursor, batchDays));
        const res = await ctx.database.remove(table, { day: { $gte: cursor, $lt: end } });
        deleted += res.matched ?? 0;
        cursor = end;
    }
    return deleted;
}
async function gc(ctx, config, options = {}) {
    const today = (0, constants_1.toDay)();
    const snapshotCutoff = (0, constants_1.shiftDay)(today, -config.data.snapshotDays);
    const dailyCutoff = (0, constants_1.shiftDay)(today, -config.data.dailyDays);
    const batchDays = options.batchDays ?? 90;
    const dryRun = options.dryRun ?? false;
    const firstDay = Number(await (0, repo_1.metaGet)(ctx, 'firstDay')) || snapshotCutoff;
    if (dryRun) {
        const expiredSnapshots = (await repo.getSnapshots(ctx, [], firstDay)).filter((s) => s.day < snapshotCutoff);
        const expiredDaily = (await repo.getDaily(ctx, [], dailyCutoff)).filter((d) => d.day < dailyCutoff);
        return {
            snapshots: expiredSnapshots.length,
            daily: expiredDaily.length,
            manual: 0,
            dryRun,
            cutoff: { snapshot: snapshotCutoff, daily: dailyCutoff },
        };
    }
    const snapshots = await deleteByDayRange(ctx, 'pw_snapshot', firstDay, snapshotCutoff, batchDays);
    const daily = await deleteByDayRange(ctx, 'pw_daily', firstDay, dailyCutoff, batchDays);
    // 清理过期的人工录入 meta（键形如 manual:{offerId}:{day}）
    let manual = 0;
    const metas = await ctx.database.get('pw_meta', {});
    for (const row of metas) {
        if (!row.key.startsWith('manual:'))
            continue;
        const day = Number(row.key.split(':').pop());
        if (day && day < snapshotCutoff) {
            await (0, repo_1.metaDel)(ctx, row.key);
            manual++;
        }
    }
    return { snapshots, daily, manual, dryRun, cutoff: { snapshot: snapshotCutoff, daily: dailyCutoff } };
}
/** 各表行数与数据库文件体积（doctor 用） */
async function stats(ctx) {
    const tables = [
        ['pw_model', '型号'], ['pw_offer', '报价'], ['pw_snapshot', '日快照'],
        ['pw_daily', '日聚合'], ['pw_stat', '指标'], ['pw_sub', '订阅'],
        ['pw_target', '推送目标'], ['pw_meta', '状态'],
    ];
    const result = [];
    for (const [table, label] of tables) {
        // 不传 fields：各表主键不同（有的是 id，有的是 modelId），
        // 硬指定 'id' 会在 pw_stat 上抛 no such column: id
        const rows = (await ctx.database.get(table, {})).length;
        result.push({ table: label, rows });
    }
    return result;
}
//# sourceMappingURL=gc.js.map