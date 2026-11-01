/**
 * 平台名归一化。
 *
 * 用户会用「京东 / 京东商城 / jd / JD」「拼多多 / 拼夕夕 / pdd」「淘宝 / 天猫 / taobao」，
 * 但内部只认 `jd` / `pdd` / `taobao`。所有接收平台参数的指令都必须先过这里，
 * 否则就会出现「暂不支持 拼多多 的登录」这种把中文名当平台键的 bug。
 */

export type PlatformKey = 'jd' | 'pdd' | 'taobao'

const ALIASES: Record<string, PlatformKey> = {
  jd: 'jd',
  '京东': 'jd',
  '京东商城': 'jd',
  'jingdong': 'jd',
  pdd: 'pdd',
  '拼多多': 'pdd',
  '拼夕夕': 'pdd',
  'pinduoduo': 'pdd',
  taobao: 'taobao',
  '淘宝': 'taobao',
  '淘宝网': 'taobao',
  '天猫': 'taobao',
  tmall: 'taobao',
}

export const PLATFORM_KEYS: PlatformKey[] = ['jd', 'pdd', 'taobao']

export const PLATFORM_TEXT: Record<string, string> = {
  jd: '京东',
  pdd: '拼多多',
  taobao: '淘宝',
  manual: '人工',
  mock: '演示',
}

/** 认不出返回 null（调用方要给出可读的候选列表） */
export function normalizePlatform(input?: string | null): PlatformKey | null {
  if (!input) return null
  const key = input.trim().toLowerCase()
  return ALIASES[key] ?? ALIASES[input.trim()] ?? null
}

/** 给报错用的候选提示 */
export function platformChoices(): string {
  return '京东 / 拼多多 / 淘宝（也可以写 jd / pdd / taobao）'
}

/** 中文名（认不出就原样返回） */
export function platformLabel(platform: string): string {
  return PLATFORM_TEXT[platform] ?? platform
}
