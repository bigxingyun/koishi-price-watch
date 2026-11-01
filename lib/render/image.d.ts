import type { Context } from 'koishi';
import { type Category } from '../constants';
import type { Config } from '../index';
import type { DigestModel } from './model';
import { THEMES, themeOf, type ThemeKey } from './themes';
/**
 * 报表出图。
 *
 * 三条硬约束（需求里明确提的）：
 * 1. **宽度受限、长度不受限**：宽度取配置 imageWidth（默认 960），高度由内容撑开，
 *    先量 scrollHeight 再把视口设成这个高度截图，所以字多会自动变长。
 * 2. **一个品类一张图**：显卡 / 内存 / 固态各出一张。
 * 3. **元素自适应**：所有主题都是流式布局（不写死高度、不裁切），长名字自动换行。
 */
export interface RenderedSheet {
    category: Category;
    label: string;
    buffer: Buffer;
    width: number;
    height: number;
    mime: string;
    theme: ThemeKey;
}
export declare const SHEET_CATEGORIES: Category[];
export declare function sheetLabel(category: Category): string;
export declare function renderSheet(ctx: Context, config: Config, digest: DigestModel, category: Category, theme?: ThemeKey): Promise<RenderedSheet>;
/** 渲染全部品类（显卡 → 内存 → 固态），没有数据的品类跳过 */
export declare function renderSheets(ctx: Context, config: Config, digest: DigestModel, theme?: ThemeKey): Promise<RenderedSheet[]>;
export { THEMES, themeOf };
export type { ThemeKey };
/** 组装性价比行：显卡看「性能/价格」，内存固态看「每 GB 价格」 */
export declare function buildValueRows(digest: DigestModel, category: Category): import("../stats/bench").ValueRow[];
export declare function renderValueSheet(ctx: Context, config: Config, digest: DigestModel, category: Category, theme?: ThemeKey): Promise<RenderedSheet>;
export declare function renderLadderSheet(ctx: Context, config: Config, digest: DigestModel, theme?: ThemeKey): Promise<RenderedSheet>;
