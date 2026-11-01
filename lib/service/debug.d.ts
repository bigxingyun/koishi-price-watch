import type { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 一键调试报告（L4）。
 *
 * 场景：用户在 Linux/容器/别的机器上出问题，我们没法复现。
 * 让他跑一条指令，把「环境 + 脱敏配置 + 浏览器指纹 + 数据状态 + 最近日志」
 * 写成一个文件发回来，比来回问十轮快得多。
 */
export interface DebugReport {
    text: string;
    file: string;
}
export declare function buildDebugReport(ctx: Context, config: Config): Promise<DebugReport>;
/** 报告通常很长，聊天里只回摘要 + 文件路径 */
export declare function debugSummary(report: DebugReport): string;
