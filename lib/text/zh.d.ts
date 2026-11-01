/**
 * 用户可见文案的唯一来源（P5：指令与交互文案重置）。
 *
 * 为什么单独抽出来：
 * 1. 以前文案散在 6 个文件里，改一处忘一处，同一个概念三种说法（「数据源/接口/爬虫」）
 * 2. 报错形式不统一：有的只有一句话，有的带了下一步，有的什么都不说
 * 3. 想换语气/换措辞时，只需要改这一个文件
 *
 * 约定（写新文案时遵守）：
 * - 一句话说清「发生了什么」，第二行说「下一步做什么」
 * - 命令用反引号包起来，路径用「」包起来，占位符用「XX」
 * - 不用感叹号，不卖萌，不说「请稍候再试」这种空话
 */
export declare const PLATFORM_CHOICES = "\u4EAC\u4E1C / \u62FC\u591A\u591A / \u6DD8\u5B9D\uFF08\u4E5F\u53EF\u5199 jd / pdd / taobao\uFF09";
export declare const THEME_CHOICES = "\u62A5\u7EB8 / \u5927\u7406\u77F3 / \u50CF\u7D20\uFF08\u4E5F\u53EF\u5199 newspaper / marble / pixel\uFF09";
export declare const MODE_CHOICES = "text / image / markdown";
/** 统一错误格式：第一行原因，第二行下一步 */
export declare function err(reason: string, next?: string): string;
/** 统一成功格式：结论 + 可选下一步 */
export declare function ok(summary: string, next?: string): string;
/** 不认识的主题 / 形态 / 平台，统一这四种写法 */
export declare const unknown: {
    theme: (input: string) => string;
    mode: (input: string) => string;
    platform: (input: string) => string;
    report: (input: string) => string;
};
/** 帮助：按「我想干什么」分组，而不是按技术模块分组 */
export declare const HELP: string;
/** 常见场景的引导语 */
export declare const next: {
    scanLogin: string;
    collect: string;
    demo: string;
    fixConfig: (field: string) => string;
    retry: string;
};
/**
 * 管理指令的用法说明（P5 第二轮）。
 *
 * 以前每个指令各写一句「用法：…」，写法不统一、改一处漏一处。
 * 现在集中在这里，指令只引用 key。
 */
export declare const usage: {
    readonly dump: "用法：价格 管理 查看 5070ti";
    readonly bind: "用法：价格 管理 绑定 5070ti 京东 「商品链接」\n　　　或：价格 管理 绑定 5070ti 京东（不给链接，自动搜一个）";
    readonly search: "用法：价格 管理 搜索 5070ti 京东";
    readonly set: "用法：价格 管理 录入 5070ti 6299（最后可加平台：… 6299 拼多多）";
    readonly unblock: "用法：价格 管理 解封 京东";
    readonly diagnose: "用法：价格 管理 诊断 京东 100012043978（商品ID可省略，省略则用库里第一个该平台报价）";
    readonly targetAdd: "用法：价格 管理 推送 加 [报表|告警|登录] / 价格 管理 推送 列表 / 价格 管理 推送 删 1";
    readonly targetRemove: "用法：价格 管理 推送 删 1";
    readonly loginConfirm: "用法：价格 管理 登录 确认（走向导）";
};
