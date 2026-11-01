/**
 * 登录状态机的**纯逻辑**（L0，无任何运行时依赖）。
 *
 * 为什么单独放这里：wizard.ts 会 import koishi、浏览器、数据库，
 * 在单测里加载它会连带拉起整个运行时（实测报 Class extends 错误）。
 * 把「决策」与「执行」分开后，决策部分可以零依赖地被测试覆盖。
 */
export declare const LOGIN_ORDER: readonly ["pdd", "jd", "taobao"];
export type StepResult = 'ok' | 'skipped' | 'failed';
export interface Session {
    queue: string[];
    current: string;
    results: Record<string, StepResult>;
    deadline: number;
    refreshedAt: number;
    startedAt: number;
    origin?: {
        platform: string;
        channelId: string;
        selfId?: string;
    };
}
export declare const REFRESH_MS = 45000;
export type StepEvent = 'verify_ok' | 'verify_no' | 'timeout' | 'skip' | 'confirm';
export type StepAction = 'wait' | 'advance_ok' | 'advance_skipped' | 'refresh_qr';
/**
 * 给定 session 与外部事件，决定下一步动作。
 * 过期优先级最高：任何事件遇到已过期，一律跳过，绝不允许卡在「剩余 0 秒」。
 */
export declare function decide(session: Session, event: StepEvent, now: number): StepAction;
/** 推进后的 session（纯计算）：队列空了返回 null 表示流程结束 */
export declare function afterAdvance(session: Session, result: StepResult, timeoutMs: number, now: number): Session | null;
