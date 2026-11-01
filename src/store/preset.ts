import { Context } from 'koishi'

import { PRESET_MODELS } from '../presets/models.v1'

/**
 * 导入内置型号：**只补不覆盖**。
 * 已存在的 id 一律跳过，主人在库里改过的 name / aliases / inIndex / priority 不会被升级冲掉。
 *
 * @returns 实际新增的条数
 */
export async function importPreset(ctx: Context): Promise<number> {
  const existing = await ctx.database.get('pw_model', {}, ['id'])
  const known = new Set(existing.map((row) => row.id))

  const rows = PRESET_MODELS
    .filter((m) => !known.has(m.id))
    .map((m) => ({
      id: m.id,
      category: m.category,
      brand: m.brand,
      name: m.name,
      spec: {},
      aliases: m.aliases,
      inIndex: m.inIndex,
      priority: m.priority,
      createdAt: new Date(),
    }))

  if (!rows.length) return 0
  // 逐条 create：minato 的 create 类型在这里只接受单行
  for (const row of rows) await ctx.database.create('pw_model', row)
  return rows.length
}

/** 与线上型号库比对，报告 preset 里有哪些是本地还没有的（不写库） */
export async function diffPreset(ctx: Context) {
  const existing = await ctx.database.get('pw_model', {}, ['id'])
  const known = new Set(existing.map((row) => row.id))
  return PRESET_MODELS.filter((m) => !known.has(m.id))
}
