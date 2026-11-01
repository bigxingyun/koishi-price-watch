/**
 * 从商品链接 / 纯 ID 里解析平台 itemId，并校验它「像不像真的 ID」。
 *
 * 单独成文件是为了「可测试」：它是纯函数，不该被指令模块拖上整个 koishi 运行时。
 *
 * 血的教训：以前是「从任意字符串里抠第一段 6 位以上数字」，
 * 于是 `mock-900007` 被当成京东商品 ID、`pdd-gpu:rtx5090-32g` 被直接拼进
 * `goods.html?goods_id=`，页面只会回「商品不存在」。
 */
export declare function isValidItemId(platform: string, itemId: string | undefined | null): boolean;
export declare function describeInvalidId(platform: string, itemId: string): string;
export declare function extractItemId(platform: string, input: string): string | null;
