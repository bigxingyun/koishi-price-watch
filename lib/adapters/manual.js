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
exports.manualAdapter = void 0;
exports.setManualPrice = setManualPrice;
const constants_1 = require("../constants");
const normalize_1 = require("../crawler/normalize");
const repo = __importStar(require("../store/repo"));
/**
 * 人工录入适配器：主人用 `price admin set` 写进来的价格，从这里读。
 *
 * 存在 pw_meta 的 `manual:{offerId}:{day}` 里，值就是「元」文本。
 * 这条通道完全合规、零网络，冷启动与平台拿不到数据时是唯一可靠来源。
 */
exports.manualAdapter = {
    platform: 'manual',
    async fetch(job) {
        const raw = await repo.metaGet(job.ctx, `manual:${job.offer.id}:${job.day}`);
        if (!raw) {
            return { price: 0, status: constants_1.STATUS.FAILED, note: `今日未人工录入（price admin set ${job.model.name} ...）` };
        }
        const price = (0, normalize_1.parsePrice)(raw);
        if (!price || !(0, normalize_1.isSanePrice)(price)) {
            return { price: 0, status: constants_1.STATUS.FAILED, note: `人工录入的值无法解析：${raw}` };
        }
        return { price, status: constants_1.STATUS.OK, note: 'manual' };
    },
};
/** 写入一条人工价格（元），供指令调用 */
async function setManualPrice(ctx, offerId, day, yuan) {
    await repo.metaSet(ctx, `manual:${offerId}:${day}`, String(yuan));
}
//# sourceMappingURL=manual.js.map