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
exports.bindOffer = bindOffer;
exports.recordManualPrice = recordManualPrice;
exports.addPushTarget = addPushTarget;
exports.removePushTarget = removePushTarget;
exports.subscribeModel = subscribeModel;
exports.unsubscribeModel = unsubscribeModel;
const constants_1 = require("../constants");
const manual_1 = require("../adapters/manual");
const aggregate_1 = require("../store/aggregate");
const repo = __importStar(require("../store/repo"));
/** 绑定/更新一个平台的报价 */
async function bindOffer(ctx, input) {
    const created = await repo.upsertOffer(ctx, {
        modelId: input.model.id,
        platform: input.platform,
        shopId: '',
        shopName: input.shopName ?? '',
        itemId: input.itemId,
        url: input.url ?? '',
        title: input.model.name,
        active: true,
    });
    const offers = await repo.listOffers(ctx, input.model.id);
    const offer = offers.find((o) => o.platform === input.platform && o.itemId === input.itemId);
    return { created, id: offer?.id };
}
/** 人工录入今日价格：保证有报价 → 写人工价 → 写快照 → 重建聚合 */
async function recordManualPrice(ctx, input) {
    const { model, platform, yuan } = input;
    const day = (0, constants_1.toDay)();
    let offers = await repo.listOffers(ctx, model.id);
    let offer = offers.find((o) => o.platform === platform);
    if (!offer) {
        await repo.upsertOffer(ctx, {
            modelId: model.id,
            platform,
            shopId: '',
            shopName: '',
            // 人工录入用的占位 ID：含数字，避免被采集器当成「没绑定真实链接」而误采
            itemId: `${platform}-${Date.now()}`,
            url: '',
            title: model.name,
            active: true,
        });
        offers = await repo.listOffers(ctx, model.id);
        offer = offers.find((o) => o.platform === platform);
    }
    if (!offer)
        return { ok: false, reconstructed: 0, day };
    await (0, manual_1.setManualPrice)(ctx, offer.id, day, yuan);
    await repo.upsertSnapshot(ctx, {
        offerId: offer.id,
        modelId: model.id,
        day,
        price: (0, constants_1.toCents)(yuan),
        listPrice: (0, constants_1.toCents)(yuan),
        status: 0,
        samples: 1,
    });
    const rebuilt = await (0, aggregate_1.rebuildAll)(ctx, [model.id]);
    return { ok: true, reconstructed: rebuilt.daily, day };
}
/** 推送目标：登记当前会话 */
async function addPushTarget(ctx, input) {
    return repo.addTarget(ctx, {
        platform: input.platform,
        channelId: input.channelId,
        selfId: input.selfId,
        guildId: input.guildId,
        kind: input.kind,
        mode: 'auto',
    });
}
async function removePushTarget(ctx, id) {
    return repo.removeTarget(ctx, id);
}
/** 订阅某个型号（唯一的写入入口） */
async function subscribeModel(ctx, scope, modelId) {
    return repo.addSub(ctx, {
        platform: scope.platform,
        channelId: scope.channelId,
        userId: scope.userId,
        modelId,
        kind: 'digest',
        threshold: 0,
    });
}
async function unsubscribeModel(ctx, scope, modelId) {
    return repo.removeSub(ctx, scope.platform, scope.channelId, modelId);
}
//# sourceMappingURL=offers.js.map