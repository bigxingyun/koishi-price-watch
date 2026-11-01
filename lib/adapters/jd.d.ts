import { type Adapter, type AdapterJob } from '../crawler/types';
/** 从 offer 的 itemId / url 里取 skuId */
export declare function extractSku(job: AdapterJob): string | null;
/** 从手机页 HTML 里按优先级找明文价格（分） */
export declare function parseJdHtml(html: string): {
    price: number;
    listPrice?: number;
} | null;
export declare const jdAdapter: Adapter;
