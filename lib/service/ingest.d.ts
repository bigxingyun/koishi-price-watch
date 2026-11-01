import type { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 外部数据接入（给用户自己的爬虫用）。
 *
 * 设计目标：用户不必改插件代码，只要按约定格式 POST 一份 JSON 过来，
 * 数据就会经过同一套清洗规则写进库里，报表立刻能用。
 *
 * 接入方式两种：
 *   1. HTTP：POST /price-watch/ingest（需要 ingest.token）
 *   2. 指令：价格 管理 导入 <JSON>（仅主人）
 *
 * 无论哪种，都要过三道清洗：价格合理性 → 偏离中位数 → 字段完整性。
 */
export interface IngestQuote {
    /** 平台：jd / pdd / taobao / manual */
    platform: string;
    /** 型号名（会先按名字匹配型号库，匹配不到就新建） */
    model: string;
    /** 价格（元，不是分） */
    price: number;
    /** 商品 ID（可选，用于绑定/去重） */
    itemId?: string;
    /** 商品标题（可选，用于型号校验） */
    title?: string;
    /** 店铺名（可选） */
    shopName?: string;
    /** 商品链接（可选） */
    url?: string;
    /** 列表价/原价（可选） */
    listPrice?: number;
    /** 数据日期 YYYYMMDD（可选，默认今天） */
    day?: number;
    /** 稀有字段：抓取来源说明，会写进备注 */
    note?: string;
}
export interface IngestPayload {
    token?: string;
    source?: string;
    quotes: IngestQuote[];
}
export interface IngestResult {
    accepted: number;
    rejected: Array<{
        index: number;
        reason: string;
    }>;
    day: number;
}
export declare function ingestQuotes(ctx: Context, config: Config, payload: IngestPayload): Promise<IngestResult>;
/** 返回给调用方的摘要文本（HTTP 与指令共用） */
export declare function describeIngest(result: IngestResult, source?: string): string;
