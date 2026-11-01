import type { PageLike } from './browser';
/** 从型号名里抽代号：RTX 5070 Ti 16G → ['5070ti'] */
export declare function modelTokens(name: string): string[];
export interface SkuResult {
    ok: boolean;
    selected: string;
    reason?: string;
}
export declare function selectSku(page: PageLike, platform: string, targetModel: string): Promise<SkuResult>;
