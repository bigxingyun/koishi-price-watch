/**
 * 插件自己的日志环形缓冲。
 *
 * 为什么不用 Koishi 的日志文件：宿主可能没开文件日志、也可能在容器里不方便取。
 * 这里自己留最近 N 条，`价格 管理 调试` 直接把它们打包进报告，
 * 用户把报告发过来就能定位问题（尤其是 Linux 上我们没法复现的环境问题）。
 */

export interface LogEntry {
  at: number
  level: 'debug' | 'info' | 'warn' | 'error'
  text: string
}

const LIMIT = 400
const buffer: LogEntry[] = []

function stringify(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

export function pushLog(level: LogEntry['level'], args: unknown[]): void {
  buffer.push({ at: Date.now(), level, text: stringify(args) })
  if (buffer.length > LIMIT) buffer.splice(0, buffer.length - LIMIT)
}

export function readLogs(limit = LIMIT): LogEntry[] {
  return buffer.slice(-limit)
}

export function formatLogs(limit = 200): string {
  const entries = readLogs(limit)
  if (!entries.length) return '（插件暂无日志）'
  return entries
    .map((entry) => {
      const time = new Date(entry.at).toLocaleString('zh-CN', { hour12: false })
      return `[${time}] ${entry.level.toUpperCase().padEnd(5)} ${entry.text}`
    })
    .join('\n')
}

/**
 * 把任意 logger 的四个级别接到环形缓冲上（幂等）。
 * 采集/登录/渲染写的日志会自动进缓冲，不用逐处改。
 */
export function attachLogger<T>(logger: T): T {
  const target = logger as unknown as Record<string, unknown>
  if (!target || typeof target !== 'object') return logger
  if (target.__logring) return logger
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    const original = target[level]
    if (typeof original !== 'function') continue
    const bound = (original as (...args: unknown[]) => unknown).bind(logger)
    target[level] = (...args: unknown[]) => {
      pushLog(level, args)
      return bound(...args)
    }
  }
  target.__logring = true
  return logger
}
