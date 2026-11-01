import type { Category } from '../constants';
/**
 * 内置默认型号表（28 个）。
 *
 * 三条规则（见设计文档 §1.2.1）：
 * 1. 只补不覆盖：启动时按 id 比对，只插入缺失的型号
 * 2. 带版本号：升级时用 `price admin preset diff` 看新增了什么
 * 3. 只给型号，不给链接：商品链接易失（下架/换 SKU），必须由主人绑定
 *
 * 型号会随市场变化而"过保质期"，这里只是起点，主人可用指令增删改。
 */
export interface PresetModel {
    id: string;
    category: Category;
    brand: string;
    name: string;
    aliases: string[];
    inIndex: boolean;
    priority: number;
}
export declare const PRESET_VERSION = 1;
export declare const PRESET_MODELS: PresetModel[];
