import type { Category } from '../../constants';
import type { DigestModel } from '../model';
import { PLATFORM_ZH, type SheetModel, type Theme, type ThemeKey } from './common';
export { PLATFORM_ZH };
export type { SheetModel, Theme, ThemeKey };
export declare const THEMES: Record<ThemeKey, Theme>;
export declare const THEME_LABELS: Record<ThemeKey, string>;
export declare function themeOf(key: string | undefined): Theme;
/** 把一个完整 digest 拆成「一个品类一张图」*/
export declare function buildSheet(digest: DigestModel, category: Category, categoryLabel: string, theme: ThemeKey, width: number): SheetModel;
/** 整页 HTML（主题自己出样式，这里只负责骨架与字体兜底）*/
export declare function renderHtml(sheet: SheetModel): string;
/** 性价比榜：显卡比「性能/价格」，内存固态比「每 GB 价格」 */
export declare function buildValueSheet(digest: DigestModel, category: Category, rows: Array<{
    name: string;
    price: number;
    metric: number;
    value: number;
    unit: string;
    higherIsBetter: boolean;
}>, theme: ThemeKey, width: number): SheetModel;
/** 显卡天梯图：按性能分从高到低 */
export declare function buildLadderSheet(digest: DigestModel, rows: Array<{
    name: string;
    price: number;
    score: number;
}>, theme: ThemeKey, width: number): SheetModel;
