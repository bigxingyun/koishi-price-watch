import { Context } from 'koishi';
/**
 * 导入内置型号：**只补不覆盖**。
 * 已存在的 id 一律跳过，主人在库里改过的 name / aliases / inIndex / priority 不会被升级冲掉。
 *
 * @returns 实际新增的条数
 */
export declare function importPreset(ctx: Context): Promise<number>;
/** 与线上型号库比对，报告 preset 里有哪些是本地还没有的（不写库） */
export declare function diffPreset(ctx: Context): Promise<import("../presets/models.v1").PresetModel[]>;
