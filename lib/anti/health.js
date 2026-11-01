"use strict";
/**
 * 反爬协议层（隔离模块，L1.5）。
 *
 * 设计目标：**协议失效不能拖累主链路**。
 *
 * 平台的反爬参数（京东 h5st、拼多多 anti_content、淘宝 x5sec）是随版本滚动的协议，
 * 迟早会失效。所以这里：
 *   1. 每个协议实现独立成文件，只在 enabled 时加载
 *   2. 任何失败都不抛给采集主线，只记健康状态并降级
 *   3. 连续失败达到阈值自动熔断，避免每轮都去撞
 *   4. `价格 管理 协议` 能一眼看到「谁在用、版本多少、最近是否失败」
 *
 * 依赖方向：本模块不 import 采集/渲染/指令，只有采集层可选用它。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISABLE_MS = exports.FAIL_THRESHOLD = exports.AntiNotImplementedError = exports.AntiProtocolStaleError = exports.ANTI_VERSIONS = void 0;
exports.initialHealth = initialHealth;
exports.afterSuccess = afterSuccess;
exports.afterFailure = afterFailure;
exports.afterUnimplemented = afterUnimplemented;
exports.isUsable = isUsable;
exports.describeHealth = describeHealth;
/** 协议版本：失效时靠它判断「是不是版本过期」而不是「网络抖动」 */
exports.ANTI_VERSIONS = {
    jd: null, // h5st 未实现（需要复刻加密，见 docs）
    pdd: null, // anti_content 需要抽取 webpack 模块，未实现
    taobao: null, // x5sec 需要滑块方案
};
/** 协议过期（明确知道对方换了协议，不是偶发失败） */
class AntiProtocolStaleError extends Error {
    platform;
    constructor(platform, message) {
        super(message);
        this.platform = platform;
        this.name = 'AntiProtocolStaleError';
    }
}
exports.AntiProtocolStaleError = AntiProtocolStaleError;
/** 协议未实现：和「过期」区分开，避免健康统计被未实现项污染 */
class AntiNotImplementedError extends Error {
    platform;
    constructor(platform) {
        super(`${platform} 的反爬协议尚未实现`);
        this.platform = platform;
        this.name = 'AntiNotImplementedError';
    }
}
exports.AntiNotImplementedError = AntiNotImplementedError;
/** 连续失败多少次就熔断 */
exports.FAIL_THRESHOLD = 3;
/** 熔断时长：1 小时 */
exports.DISABLE_MS = 60 * 60 * 1000;
function initialHealth(platform) {
    return {
        platform,
        state: exports.ANTI_VERSIONS[platform] ? 'ok' : 'unimplemented',
        version: exports.ANTI_VERSIONS[platform],
        failures: 0,
        disabledUntil: 0,
    };
}
/**
 * 健康状态转移（纯函数，可单测）。
 *
 * - 成功：清零失败计数、回到 ok
 * - 协议过期：立刻 stale（不重试，等人修）
 * - 普通失败：累计；到阈值 → degraded + 熔断
 * - 熔断期间：disabled，采集层直接跳过，不再发请求
 */
function afterSuccess(health, now) {
    return { ...health, state: 'ok', failures: 0, disabledUntil: 0, lastReason: undefined, checkedAt: now };
}
function afterFailure(health, error, now) {
    const stale = error instanceof AntiProtocolStaleError;
    const failures = stale ? health.failures + 1 : health.failures + 1;
    const reason = error?.message ?? String(error);
    if (stale) {
        return { ...health, state: 'stale', failures, lastReason: reason, checkedAt: now, disabledUntil: now + exports.DISABLE_MS };
    }
    if (failures >= exports.FAIL_THRESHOLD) {
        return { ...health, state: 'degraded', failures, lastReason: reason, checkedAt: now, disabledUntil: now + exports.DISABLE_MS };
    }
    return { ...health, state: health.state === 'ok' ? 'ok' : health.state, failures, lastReason: reason, checkedAt: now };
}
function afterUnimplemented(health) {
    return { ...health, state: 'unimplemented', version: null, failures: 0, disabledUntil: 0 };
}
/**
 * 当前是否可用。
 * 熔断到期后回到「半开」：允许再试一次，成功就恢复，失败继续熔断。
 */
function isUsable(health, now) {
    if (health.state === 'unimplemented' || health.state === 'stale')
        return false;
    if (health.disabledUntil > now)
        return false;
    return true;
}
/** 给人看的一句话 */
function describeHealth(health) {
    const text = {
        ok: '正常',
        degraded: '连续失败，已熔断',
        stale: '协议已过期（需更新实现）',
        disabled: '已禁用',
        unimplemented: '尚未实现',
    };
    const parts = [text[health.state]];
    if (health.version)
        parts.push(`版本 ${health.version}`);
    if (health.failures)
        parts.push(`失败 ${health.failures} 次`);
    if (health.disabledUntil > Date.now()) {
        parts.push(`熔断至 ${new Date(health.disabledUntil).toLocaleString('zh-CN')}`);
    }
    return parts.join(' · ');
}
//# sourceMappingURL=health.js.map