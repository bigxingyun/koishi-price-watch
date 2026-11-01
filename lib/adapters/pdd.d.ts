import { type Adapter, type AdapterJob } from '../crawler/types';
export declare function extractGoodsId(job: AdapterJob): string | null;
/** 从 HTML 里抽 `window.rawData` 并取价格（分） */
export declare function parsePddHtml(html: string): {
    price: number;
    listPrice?: number;
} | null;
export declare const pddAdapter: Adapter;
