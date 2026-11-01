import type { Context } from 'koishi'

import type { Config } from '../index'
import { profileDirOf } from '../crawler/browser'
import {
  clearActiveLogin,
  getAuthState,
  inspectPlatform,
  skipLogin,
  verifyLogin,
} from './login'
import { LOGIN_SPECS } from './methods'

/**
 * 登录自检。
 *
 * 目的**只有一个**：回答「这三个平台现在能不能登录 / 是否已经登录」。
 *
 * 所以这里**不截二维码、不点「扫码登录」、不裁剪图片** ——
 * 那是「发起登录」这个动作的职责。两件事混在一起会让自检多花 20 秒，
 * 还会答非所问（之前就是把自检写成了一次完整登录流程）。
 *
 * 自检只做四件跟「能不能用」有关的事：
 *   1. 登录方式是否定义（扫码 / 窗口）
 *   2. 浏览器采集是否开启（关着必然登不了）
 *   3. 登录页是否可达（HTTP 探活，不启浏览器）
 *   4. 登录态是否有效（行为验证：导航会员页/登录页，看是否被踢）
 */

export interface SelfCheckRow {
  platform: string
  method: string
  specOk: boolean
  browserOk: boolean
  profileExists: boolean
  profilePath: string
  cookieCount: number
  pageStatus: string
  loggedIn: boolean | null
  detail: string
}

async function probeLoginPage(ctx: Context, config: Config, url: string): Promise<string> {
  try {
    const res = await ctx.http.get(url, {
      timeout: Math.min(10000, config.collect.timeoutMs),
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
      },
    })
    const status = (res as { status?: number })?.status ?? 200
    return `HTTP ${status}`
  } catch (error) {
    return `不可达（${(error as Error).message.slice(0, 40)}）`
  }
}

export async function runLoginSelfCheck(ctx: Context, config: Config): Promise<string> {
  const platforms = ['pdd', 'jd', 'taobao'] as const
  const rows: SelfCheckRow[] = []

  for (const platform of platforms) {
    const spec = LOGIN_SPECS[platform]
    const info = await inspectPlatform(ctx, config, platform).catch(() => null)
    const pageStatus = spec ? await probeLoginPage(ctx, config, spec.url) : '无登录页'
    // 只有「行为验证」会启浏览器，而且只导航、不截图
    const live = spec && config.collect.browserEnabled
      ? await verifyLogin(ctx, config, platform).catch(() => null)
      : null

    rows.push({
      platform,
      method: spec?.methodLabel ?? '未定义',
      specOk: !!spec,
      browserOk: config.collect.browserEnabled,
      profileExists: info?.profileExists ?? false,
      profilePath: info?.profilePath ?? profileDirOf(config, platform),
      cookieCount: info?.cookieCount ?? 0,
      pageStatus,
      loggedIn: live ? live.loggedIn : null,
      detail: live?.detail ?? (config.collect.browserEnabled ? '未验证' : '浏览器未开启'),
    })

    // 行为验证不开窗口，这里只是兜底清理，避免占用 profile 目录
    await clearActiveLogin(ctx).catch(() => undefined)
    if (!live?.loggedIn) await skipLogin(ctx, platform).catch(() => undefined)
  }

  const zh: Record<string, string> = { jd: '京东', pdd: '拼多多', taobao: '淘宝' }
  const lines = ['登录自检（只查能不能登录 / 是否已登录，不做二维码）：', '']

  for (const row of rows) {
    const stateText = row.loggedIn === null ? '未验证' : row.loggedIn ? '已登录' : '未登录'
    lines.push(`${row.loggedIn ? '✓' : '·'} ${zh[row.platform] ?? row.platform}　${stateText}`)
    lines.push(`   登录方式：${row.specOk ? row.method : '✗ 未定义'}`)
    lines.push(`   浏览器：${row.browserOk ? '已开启' : '✗ 未开启'}`)
    lines.push(`   登录页：${row.pageStatus}`)
    lines.push(`   profile：${row.profileExists ? `存在（${row.cookieCount} 个 cookie）` : '尚未创建'}`)
    if (row.loggedIn === false) lines.push(`   判定：${row.detail}`)
    if (!row.loggedIn && row.browserOk) lines.push(`   下一步：价格 管理 登录 ${zh[row.platform] ?? row.platform}`)
    lines.push('')
  }

  const ready = rows.filter((row) => row.specOk && row.browserOk && row.pageStatus.startsWith('HTTP')).length
  const logged = rows.filter((row) => row.loggedIn).length
  lines.push(`结论：${ready}/${rows.length} 个平台具备登录条件，${logged} 个已登录。`)
  if (ready < rows.length) lines.push('有平台不具备条件：先确认浏览器已开启、网络可达。')
  else if (!logged) lines.push('条件都齐但都未登录，发「价格 管理 登录」扫码即可。')

  const jdState = await getAuthState(ctx, 'jd')
  if (jdState === 'pending') lines.push('（京东状态停在「登录中」，说明上次流程没走完，重新发起一次即可。）')

  return lines.join('\n')
}
