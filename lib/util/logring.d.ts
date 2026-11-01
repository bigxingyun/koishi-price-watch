/**
 * 插件自己的日志环形缓冲。
 *
 * 为什么不用 Koishi 的日志文件：宿主可能没开文件日志、也可能在容器里不方便取。
 * 这里自己留最近 N 条，`价格 管理 调试` 直接把它们打包进报告，
 * 用户把报告发过来就能定位问题（尤其是 Linux 上我们没法复现的环境问题）。
 */
export interface LogEntry {
    at: number;
    level: 'debug' | 'info' | 'warn' | 'error';
    text: string;
}
export declare function pushLog(level: LogEntry['level'], args: unknown[]): void;
export declare function readLogs(limit?: number): LogEntry[];
export declare function formatLogs(limit?: number): string;
/**
 * 把任意 logger 的四个级别接到环形缓冲上（幂等）。
 * 采集/登录/渲染写的日志会自动进缓冲，不用逐处改。
 */
export declare function attachLogger<T>(logger: T): T;
