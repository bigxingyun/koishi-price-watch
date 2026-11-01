import type { Config, RenderMode } from '../index'

/**
 * 平台能力表。
 *
 * 三个诚实说明（设计文档 §2.7.3）：
 * 1. 数字不是契约：随适配器版本与平台策略变化，所以可被配置覆盖
 * 2. markdown 必须由主人显式开启，插件**不猜**平台能力
 * 3. 最终保险是「发送失败自动降级」，这张表只保证第一次大概率成功
 */
export interface Capability {
  label: string
  /** 单条文本参考上限（字符） */
  textLimit: number
  markdown: boolean
  image: boolean
}

export const CAPABILITY: Record<string, Capability> = {
  qq: { label: 'QQ 官方', textLimit: 600, markdown: true, image: true },
  onebot: { label: 'OneBot', textLimit: 4500, markdown: false, image: true },
  telegram: { label: 'Telegram', textLimit: 4096, markdown: true, image: true },
  discord: { label: 'Discord', textLimit: 2000, markdown: true, image: true },
  kook: { label: 'KOOK', textLimit: 5000, markdown: true, image: true },
  lark: { label: '飞书', textLimit: 1800, markdown: false, image: true },
  slack: { label: 'Slack', textLimit: 4000, markdown: true, image: true },
  matrix: { label: 'Matrix', textLimit: 8000, markdown: true, image: true },
  dingtalk: { label: '钉钉', textLimit: 1800, markdown: false, image: true },
  wecom: { label: '企业微信', textLimit: 1800, markdown: false, image: true },
  mail: { label: '邮件', textLimit: 100000, markdown: true, image: true },
  line: { label: 'LINE', textLimit: 5000, markdown: false, image: true },
  satori: { label: 'Satori', textLimit: 4000, markdown: true, image: true },
  sandbox: { label: '沙盒', textLimit: 8000, markdown: true, image: true },
}

export const FALLBACK: Capability = { label: '未知平台', textLimit: 1800, markdown: false, image: true }

export function capabilityOf(platform: string | undefined): Capability {
  if (!platform) return FALLBACK
  // 控制台沙盒的 platform 是 `sandbox:xxxx`，要用前缀匹配
  if (platform.startsWith('sandbox')) return CAPABILITY.sandbox
  return CAPABILITY[platform] ?? FALLBACK
}

/**
 * 文本上限：统一用配置里的「一条消息最长多少字」。
 * 不做「每个平台一个上限」——那对用户来说是不可维护的抽象。
 * 平台差异交给发送失败后的自动降级处理。
 */
export function textLimitOf(config: Config): number {
  return config.advanced.textLimit
}

/**
 * 决定最终渲染形态。
 * - 显式指定则以指定为准（markdown 还需开关允许）
 * - auto：能力表支持的优先 markdown（若开启）→ image → text
 * - 图片不可用（浏览器缺失）时由调用方捕获异常再降级到 text
 */
export function resolveMode(
  platform: string | undefined,
  requested: RenderMode,
  config: Config,
): Exclude<RenderMode, 'auto'> {
  const cap = capabilityOf(platform)
  if (requested !== 'auto') {
    if (requested === 'markdown' && !config.basic.markdownEnabled) return cap.image ? 'image' : 'text'
    return requested
  }
  if (config.basic.markdownEnabled && cap.markdown) return 'markdown'
  if (cap.image) return 'image'
  return 'text'
}
