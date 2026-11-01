import type { Adapter } from '../crawler/types'
import { manualAdapter } from './manual'
import { mockAdapter } from './mock'
import { taobaoAdapter } from './taobao'

/**
 * 适配器注册表（重构后）。
 *
 * 只保留两条网页采集路径：
 *   - taobao：仿真搜索 + 商品页取价（已验证可用）
 *   - manual/mock：手动录入与演示数据
 *
 * 拼多多、京东的网页端已被平台封堵（打码 / 验证墙），不再做网页适配器：
 *   - 它们的取价统一走官方 API（src/api）
 *   - 拿不到密钥时用「价格 管理 录入」手动记价
 */
const ADAPTERS: Adapter[] = [taobaoAdapter, manualAdapter, mockAdapter]

const REGISTRY = new Map(ADAPTERS.map((adapter) => [adapter.platform, adapter]))

export function getAdapter(platform: string): Adapter | undefined {
  return REGISTRY.get(platform)
}

export function listPlatforms(): string[] {
  return [...REGISTRY.keys()]
}

export { taobaoAdapter, manualAdapter, mockAdapter }
