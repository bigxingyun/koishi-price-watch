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
exports.pushDigest = pushDigest;
const repo = __importStar(require("../store/repo"));
const model_1 = require("../render/model");
const transport_1 = require("./transport");
/**
 * 推送报表。
 *
 * 「我的关注」是按目标会话各自的订阅算的，所以每个目标单独构建一次 DigestModel
 * （几十个型号 × 百余天，构建成本约 10~20 ms，日频推送完全可以承受）。
 */
async function pushDigest(ctx, config, options = {}) {
    const kind = options.kind ?? 'digest';
    const report = options.report ?? 'daily';
    const platform = options.platform ?? 'all';
    const build = async (target) => {
        const watchIds = await repo.resolveWatchIds(ctx, target.platform, target.channelId, config.basic.maxWatchItems);
        return (0, model_1.buildDigest)(ctx, config, {
            kind: report,
            platform,
            watchIds,
            maxWatch: config.basic.maxWatchItems,
        });
    };
    return (0, transport_1.dispatch)(ctx, config, {
        kind,
        build,
        dryRun: options.dryRun ?? config.advanced.dryRun,
    });
}
//# sourceMappingURL=digest.js.map