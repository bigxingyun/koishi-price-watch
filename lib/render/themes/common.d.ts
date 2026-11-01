import type { Category } from '../../constants';
import type { DigestModel } from '../model';
/** 一套主题要提供的三块：样式、表头、板块渲染 */
export interface Theme {
    key: ThemeKey;
    name: string;
    /** 主题整体色调，供能力判断与文字版使用 */
    tone: 'paper' | 'light' | 'dark';
    css: (width: number) => string;
    render: (sheet: SheetModel) => string;
}
export type ThemeKey = 'newspaper' | 'marble' | 'pixel';
export declare const THEME_KEYS: ThemeKey[];
/** 一张图 = 一个品类（显卡 / 内存 / 固态） */
export interface SheetModel {
    digest: DigestModel;
    category: Category;
    categoryLabel: string;
    /** 本品类全部型号（按价格降序） */
    items: SheetItem[];
    /** 本品类涨跌最猛的前几条 */
    movers: SheetItem[];
    /** 多个平台都有货、有价差的型号 */
    compare: Array<{
        name: string;
        offers: Array<{
            platform: string;
            price: number;
            shopName?: string;
        }>;
        spread: number;
        lowest: string;
    }>;
    /** 品类指数 */
    index?: {
        value: number;
        change: number;
        q30: number;
        zone: string;
    };
    width: number;
    theme: ThemeKey;
    title: string;
    subtitle: string;
    /** price=价格表；value=性价比榜；ladder=天梯图 */
    mode: SheetMode;
}
export type SheetMode = 'price' | 'value' | 'ladder';
export interface SheetItem {
    modelId: string;
    name: string;
    price: number;
    change: number;
    d1: number;
    pos: number;
    label: string;
    grade: string;
    modifier: string;
    confidence: string;
    offers: Array<{
        platform: string;
        price: number | null;
        shopName?: string;
    }>;
    trend: number[];
    /** 排行模式下的附加指标（性能分 / 每GB价格 / 天梯条） */
    metric?: {
        label: string;
        value: string;
        bar?: number;
        rank?: number;
    };
}
export declare function esc(text: string): string;
export declare function yuan(cents: number): string;
export declare function pct(value: number, digits?: number): string;
export declare function arrow(value: number): string;
export declare function trendClass(value: number): 'up' | 'down' | 'flat';
/** 极简 sparkline：用 div 高度画柱，不引入图表库 */
export declare function sparkbars(points: number[], height?: number): string;
/** 平台名中文 */
export declare const PLATFORM_ZH: Record<string, string>;
