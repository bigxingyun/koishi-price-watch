"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockAdapter = exports.manualAdapter = exports.taobaoAdapter = void 0;
exports.getAdapter = getAdapter;
exports.listPlatforms = listPlatforms;
const manual_1 = require("./manual");
Object.defineProperty(exports, "manualAdapter", { enumerable: true, get: function () { return manual_1.manualAdapter; } });
const mock_1 = require("./mock");
Object.defineProperty(exports, "mockAdapter", { enumerable: true, get: function () { return mock_1.mockAdapter; } });
const taobao_1 = require("./taobao");
Object.defineProperty(exports, "taobaoAdapter", { enumerable: true, get: function () { return taobao_1.taobaoAdapter; } });
/**
 * 适配器注册表（重构后）。
 *
 * 只保留两条网页采集路径：
 *   - taobao：仿真搜索 + 商品页取价（已验证可用）
 *   - manual/mock：手动录入与演示数据
 *
 * 拼多多、京东的网页端已被平台封堵（打码 / 验证墙），不再做网页适配器：
 *   - 它们的取价统一走官方 API（src/api）
 *   - 拿不到密钥时用「价格 管理 录入」手动记价
 */
const ADAPTERS = [taobao_1.taobaoAdapter, manual_1.manualAdapter, mock_1.mockAdapter];
const REGISTRY = new Map(ADAPTERS.map((adapter) => [adapter.platform, adapter]));
function getAdapter(platform) {
    return REGISTRY.get(platform);
}
function listPlatforms() {
    return [...REGISTRY.keys()];
}
//# sourceMappingURL=index.js.map