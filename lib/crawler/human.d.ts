import type { PageLike } from './browser';
export interface HumanOptions {
    /** 单步停顿范围（毫秒） */
    delay?: [number, number];
    /** 页面内滚动次数 */
    scrolls?: number;
    /** 是否移动鼠标 */
    mouse?: boolean;
}
/**
 * 在首页的搜索框里输入关键词并回车。
 *
 * 为什么必须这样：京东/拼多多的搜索接口要带 h5st 等签名参数，
 * 直接拼 URL 访问会被判「请求无效」。把关键词敲进搜索框、按回车，
 * 请求由页面自己发出，签名也就由页面自己生成 —— 这才是仿真的意义。
 */
/**
 * 真人式搜索：真实鼠标点输入框 → 真实键盘逐字输入 → 真实鼠标点「搜索」按钮。
 *
 * 为什么必须这样：京东首页搜索框是 React 受控组件，用 evaluate 派发合成事件
 * React 不认（合成事件不会更新组件 state），所以之前一直「输入了但不跳转」。
 * Playwright 的 page.mouse / page.keyboard 走 CDP，是真实输入，React 会正常处理。
 */
export declare function humanSearchReal(page: PageLike, keyword: string, options?: HumanOptions): Promise<boolean>;
export declare function humanSearch(page: PageLike, keyword: string, options?: HumanOptions): Promise<boolean>;
export declare function humanDelay(options?: HumanOptions): Promise<void>;
/** 随机滚动几屏，模拟人在浏览列表 */
export declare function humanScroll(page: PageLike, options?: HumanOptions): Promise<void>;
/** 在页面里随机移动几次鼠标（触发 mousemove，不做真实点击） */
export declare function humanMouse(page: PageLike, options?: HumanOptions): Promise<void>;
/**
 * 从搜索页点进目标商品。
 *
 * 优先点「链接里含 itemId」的商品卡；找不到就点第一个看起来像商品的卡片。
 * 返回 true 表示是点击进入的（不是直接跳转）。
 */
export declare function clickProductFromSearch(page: PageLike, itemId: string, options?: HumanOptions): Promise<boolean>;
/**
 * 真人路径进入商品页：首页 → 搜索 → 点击。
 * 任何一步失败都返回 false，由调用方决定是否回退到直连。
 */
export declare function browseToProduct(page: PageLike, urls: {
    home: string;
    search: (keyword: string) => string;
}, itemId: string, keyword: string, options?: HumanOptions): Promise<boolean>;
/**
 * 按标题点商品卡（不需要商品 ID）。
 *
 * 拼多多的商品卡既不是 <a> 也没有 data-goods-id，所以不能靠 href 找，
 * 只能像人一样：在列表里认出写着型号的那一块，点它的中心。
 * 用真实鼠标事件点击（page.mouse），触发的是页面自己的跳转，不构造 URL。
 */
export declare function clickProductByKeyword(page: PageLike, keyword: string): Promise<boolean>;
/**
 * 取「当前标签页之外新打开的那个标签页」。
 *
 * 拼多多等平台点搜索会在新标签页里打开结果，不接管新页就会一直在旧页上找商品卡，
 * 表现为「找不到可点开的商品卡」——这不是仿真没生效，是盯错了页面。
 */
export declare function waitForNewPage(browser: unknown, current: unknown, timeoutMs?: number): Promise<PageLike | null>;
/**
 * 仿真进入商品页并返回「真正进入后的页面」。
 * 搜索可能开新标签，所以返回的 page 未必是传入的那个。
 */
export declare function enterProductByHuman(page: PageLike, homeUrl: string, keyword: string, options?: HumanOptions, browser?: unknown): Promise<{
    entered: boolean;
    page: PageLike;
    reason?: string;
}>;
