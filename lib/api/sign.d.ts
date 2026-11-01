/**
 * 三家开放平台的签名。
 *
 * 都是同一个套路：`MD5(secret + 按 key 排序后的 k+v 串 + secret)`，转大写。
 * 京东联盟、淘宝客、多多进宝的差异只在参数名，算法一致 —— 所以抽成一个函数。
 */
export type Params = Record<string, string | number | undefined>;
/** 过滤空值并按 key 字典序拼接 k+v */
export declare function canonical(params: Params): string;
/** secret + 拼串 + secret，MD5 后大写 */
export declare function sign(secret: string, params: Params): string;
/** 时间戳：各平台都接受 `yyyy-MM-dd HH:mm:ss` */
export declare function timestamp(date?: Date): string;
/** 京东联盟：参数塞进 360buy_param_json，签名只覆盖外层 */
export declare function jdSign(secret: string, params: Params): string;
/** 拼多多：sign 覆盖除 sign 之外的全部参数 */
export declare function pddSign(secret: string, params: Params): string;
/** 淘宝：sign 覆盖除 sign 之外的全部参数 */
export declare function taobaoSign(secret: string, params: Params): string;
