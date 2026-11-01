/**
 * 解析价格文本为「分」。
 *
 * 支持：`¥6,299.00`、`6299`、`6,299`、`￥ 1299.9`、`6299元`
 * 明确拒绝：京东的混淆价 `3??9` / `4?`、`暂无报价`、空串
 *
 * 返回 null 表示「解析不出可信价格」，调用方应当按失败处理，**不要猜**。
 */
export declare function parsePrice(input: unknown): number | null;
/** 价格是否在合理量级（1 元 ~ 10 万元） */
export declare function isSanePrice(cents: number): boolean;
/**
 * 是否疑似异常值（相对参考价偏离 >50%）。
 * 秒杀瞬时值会命中这里 —— 它不代表趋势，喂给中位数就够了，不必单独剔除。
 */
export declare function isSuspicious(cents: number, reference?: number): boolean;
/**
 * 取页面标题。
 *
 * 为什么要有它：整页扫描做特征判断会大量误判 —— 京东商品页正文里固定有 5 处「登录」链接，
 * 250 KB 的页面里也必然出现「404」字样。所以「登录墙 / 已下架」这类判断只对**标题**做，
 * 正文只用来抽价格。
 */
export declare function extractTitle(html: string): string;
/** 判定文本（通常传页面标题）是否像「登录页 / 验证码页」 */
export declare function looksLikeAuthWall(text: string): boolean;
/** 判定文本（通常传页面标题）是否像「商品不存在 / 已下架」 */
export declare function looksLikeDelisted(text: string): boolean;
/** 把状态码翻译成一句人话（日志与调试用） */
export declare function statusText(status: number): string;
