"use strict";
/**
 * 登录状态机的**纯逻辑**（L0，无任何运行时依赖）。
 *
 * 为什么单独放这里：wizard.ts 会 import koishi、浏览器、数据库，
 * 在单测里加载它会连带拉起整个运行时（实测报 Class extends 错误）。
 * 把「决策」与「执行」分开后，决策部分可以零依赖地被测试覆盖。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFRESH_MS = exports.LOGIN_ORDER = void 0;
exports.decide = decide;
exports.afterAdvance = afterAdvance;
exports.LOGIN_ORDER = ['pdd', 'jd', 'taobao'];
exports.REFRESH_MS = 45_000;
/**
 * 给定 session 与外部事件，决定下一步动作。
 * 过期优先级最高：任何事件遇到已过期，一律跳过，绝不允许卡在「剩余 0 秒」。
 */
function decide(session, event, now) {
    if (session.deadline > 0 && now > session.deadline)
        return 'advance_skipped';
    switch (event) {
        case 'verify_ok':
        case 'confirm':
            return 'advance_ok';
        case 'skip':
        case 'timeout':
            return 'advance_skipped';
        case 'verify_no':
            return now - session.refreshedAt > exports.REFRESH_MS ? 'refresh_qr' : 'wait';
        default:
            return 'wait';
    }
}
/** 推进后的 session（纯计算）：队列空了返回 null 表示流程结束 */
function afterAdvance(session, result, timeoutMs, now) {
    const results = { ...session.results, [session.current]: result };
    // 防御：队列里不允许出现已出结论或等于当前的平台（不变量 #1）
    const queue = session.queue.filter((p) => p !== session.current && !(p in results));
    if (!queue.length)
        return null;
    const [next, ...rest] = queue;
    return {
        ...session,
        results,
        current: next,
        queue: rest,
        deadline: now + timeoutMs,
        refreshedAt: now,
    };
}
//# sourceMappingURL=state.js.map