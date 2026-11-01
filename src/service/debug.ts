import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { platform, release, arch, cpus, totalmem } from 'node:os'
import { join } from 'node:path'

import type { Context } from 'koishi'

import type { Config } from '../index'
import { antiLines, antiReport } from '../anti'
import { hasCjkFont } from '../render/font'
import * as repo from '../store/repo'
import { formatLogs } from '../util/logring'
import { qualitySummary } from './quality'

/**
 * 一键调试报告（L4）。
 *
 * 场景：用户在 Linux/容器/别的机器上出问题，我们没法复现。
 * 让他跑一条指令，把「环境 + 脱敏配置 + 浏览器指纹 + 数据状态 + 最近日志」
 * 写成一个文件发回来，比来回问十轮快得多。
 */

export interface DebugReport {
  text: string
  file: string
}

/** 关键字段脱敏：密钥、cookie、token 一律打码 */
function maskConfig(config: Config): string {
  const raw = JSON.parse(JSON.stringify(config ?? {})) as Record<string, unknown>
  const secrets = /secret|token|cookie|key|password|passwd/i
  const walk = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((item, index) => walk(item, `${path}[${index}]`))
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const nextPath = path ? `${path}.${key}` : key
        out[key] = secrets.test(key) && typeof value === 'string' && value ? '***' : walk(value, nextPath)
      }
      return out
    }
    return node
  }
  return JSON.stringify(walk(raw, ''), null, 2)
}

async function fingerprint(): Promise<string> {
  try {
    const { openProfile } = await import('../crawler/browser')
    const config = { collect: { profileDir: 'data/price-watch/profiles', browserHeadless: true, timeoutMs: 25000 } } as unknown as Config
    const session = await openProfile(config, 'jd')
    const page = await session.browser.newPage({ viewport: { width: 1280, height: 900 } })
    const info = await page
      .evaluate<string>(
        `JSON.stringify({
          webdriver: typeof navigator.webdriver,
          langs: navigator.languages,
          plugins: navigator.plugins?.length ?? 0,
          cores: navigator.hardwareConcurrency,
          ua: navigator.userAgent.slice(0, 120),
        })`,
      )
      .catch(() => 'null')
    await page.close().catch(() => undefined)
    await session.close().catch(() => undefined)
    return info
  } catch (error) {
    return `浏览器指纹获取失败：${(error as Error).message.slice(0, 160)}`
  }
}

export async function buildDebugReport(ctx: Context, config: Config): Promise<DebugReport> {
  const lines: string[] = []
  const push = (title: string, body: string | string[]) => {
    lines.push('', `── ${title} ${'─'.repeat(Math.max(0, 28 - title.length))}`)
    if (Array.isArray(body)) lines.push(...body)
    else lines.push(body)
  }

  push('环境', [
    `平台：${platform()} ${release()} (${arch()})`,
    `Node：${process.version}`,
    `CPU：${cpus().length} 核 · 内存：${Math.round(totalmem() / 1024 / 1024 / 1024)} GB`,
    `DISPLAY：${process.env.DISPLAY || '(未设置)'} · WAYLAND：${process.env.WAYLAND_DISPLAY || '(未设置)'}`,
    `Chrome 路径：${config.collect.browserPath || "（未显式配置，自动探测）"}`,
    `中文字体：${hasCjkFont() ? '可用' : '缺失（出图会降级为文本）'}`,
  ])

  push('浏览器指纹', await fingerprint())

  const healths = await antiReport(ctx, config)
  push('反爬协议', antiLines(healths))

  const models = await repo.listModels(ctx).catch(() => [])
  const offers = await repo.listOffers(ctx).catch(() => [])
  const quality = await qualitySummary(ctx).catch(() => null)
  push('数据', [
    `型号 ${models.length} · 报价 ${offers.length}`,
    quality ? `今日：成功 ${quality.ok} / 失败 ${quality.failed} / 缺货 ${quality.outOfStock} / 可疑 ${quality.suspicious}` : '质量统计不可用',
    ...quality?.lastFailures.map((failure) => `  ${failure.platform} 最近失败：${failure.reason}`) ?? [],
  ])

  push('配置（密钥已脱敏）', maskConfig(config))
  push('最近日志', formatLogs(200))

  const text = [`硬件价格监控 · 调试报告`, `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`, ...lines].join('\n')

  const dir = join(process.cwd(), 'data', 'price-watch', 'debug')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `debug-${Date.now()}.txt`)
  writeFileSync(file, text, 'utf8')
  return { text, file: existsSync(file) ? file : '(写入失败)' }
}

/** 报告通常很长，聊天里只回摘要 + 文件路径 */
export function debugSummary(report: DebugReport): string {
  const head = report.text.split('\n').slice(0, 24).join('\n')
  return [
    head,
    '',
    '……（完整报告已写入文件）',
    `文件：${report.file}`,
    '',
    '请把这个文件发给我，里面环境、指纹、配置（密钥已打码）和最近日志都有。',
  ].join('\n')
}
