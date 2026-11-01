import type { Session } from 'koishi'

import type { Config } from '../index'
import * as repo from '../store/repo'

/**
 * 「测试平台」判定。
 *
 * 为什么不能精确匹配 'sandbox'：
 * 控制台沙盒的 platform 是 `sandbox:随机后缀`（见 plugin-sandbox 客户端
 * `platform: "sandbox:" + Math.random()...`），精确匹配会全部漏掉 —— 实测踩过。
 */
export function isTrustedPlatform(platform: string | undefined): boolean {
  if (!platform) return false
  return platform === 'mock' || platform.startsWith('sandbox')
}

/**
 * 管理员判定。
 *
 * 三级放行：
 * 1. `authority >= 4`（Koishi 内置权限）
 * 2. 命中 `advanced.owners` 白名单（格式 平台:用户ID）
 * 3. 控制台沙盒 / 测试假平台：只有已登录控制台的管理员或本地测试进程能发消息
 */
/** 运行时绑定的主人列表（存数据库，重启不丢） */
export async function listOwners(ctx: import('koishi').Context): Promise<string[]> {
  const raw = await repo.metaGet(ctx, 'owner:extra').catch(() => null)
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function addOwner(ctx: import('koishi').Context, key: string): Promise<void> {
  const list = await listOwners(ctx)
  if (list.includes(key)) return
  list.push(key)
  await repo.metaSet(ctx, 'owner:extra', JSON.stringify(list))
}

export async function ensureAdmin(
  ctx: import('koishi').Context | null,
  session: Session | undefined,
  config: Config,
): Promise<boolean> {
  if (!session) return false
  if (isTrustedPlatform(session.platform)) return true

  const user = session.user as unknown as { authority?: number } | undefined
  if ((user?.authority ?? 0) >= 4) return true

  const key = `${session.platform}:${session.userId}`
  if (config.advanced.owners.includes(key)) return true
  if (ctx && (await listOwners(ctx)).includes(key)) return true
  return false
}

/** 给「仅主人可用」的提示语：直接告诉用户该填什么 */
export function adminHint(session: Session | undefined): string {
  const key = session ? `${session.platform}:${session.userId ?? '?'}` : '平台:用户ID'
  return [
    '只有主人能用。两种办法：',
    `  1. 在「高级 → 主人身份」里加上：${key}`,
    '  2. 或把你的账号权限设为 4（控制台 → 用户）',
    '',
    '想知道自己的准确标识：发「价格 管理 我是谁」',
  ].join('\n')
}
