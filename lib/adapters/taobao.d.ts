import { type Adapter, type AdapterJob } from '../crawler/types';
export declare function extractItemId(job: AdapterJob): string | null;
/** 从 HTML 的内联 JSON 里找价格（元） */
export declare function parseTaobaoHtml(html: string): number | null;
export declare const taobaoAdapter: Adapter;
