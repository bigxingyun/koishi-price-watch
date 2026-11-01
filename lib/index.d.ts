/**
 * 【依赖纪律】本插件的运行期依赖只有 koishi（peer）。
 *
 * 可选：playwright-core（peer, optional）—— 京东/淘宝/拼多多的价格必须靠真实浏览器
 * 执行页面 JS 才能拿到（价格被混淆成 `3??9`、需要登录态），Node 无替代方案。
 * 没装则插件照常启动，只关闭浏览器采集与图片渲染，并自动降级为纯文本。
 *
 * 明确不引入：dayjs / lodash / cheerio / chart.js / markdown-it / 模糊匹配库 / 定时库
 * （对应能力分别用原生 Date、原生数组方法、正则 + JSON.parse、内联 SVG、
 *   模板字符串、手写别名打分、ctx.setInterval 实现）
 */
import { Context, Schema } from 'koishi';
import { type Category } from './constants';
export declare const name = "price-watch";
export declare const inject: {
    required: string[];
    optional: string[];
};
export type RenderMode = 'auto' | 'text' | 'markdown' | 'image';
export interface TargetSeed {
    platform: string;
    channelId: string;
    selfId?: string;
    guildId?: string;
    kind?: 'digest' | 'alert' | 'auth';
    mode?: RenderMode;
}
/**
 * 配置按「人会问的问题」分组，不按技术模块分组：
 *   常规  = 盯什么、看多少
 *   推送  = 什么时候发、发到哪
 *   采集  = 多久跑一次、怎么不被封
 *   数据  = 存多久、占多大
 *   告警  = 什么时候主动叫我
 *   高级  = 一般不用动
 */
export type DataSource = 'auto' | 'api' | 'browser' | 'manual';
export interface Config {
    basic: {
        categories: Category[];
        topMovers: number;
        maxWatchItems: number;
        compareThreshold: number;
        mode: RenderMode;
        markdownEnabled: boolean;
        colorScheme: 'cn' | 'intl';
        theme: 'newspaper' | 'marble' | 'pixel';
        imageWidth: number;
        imageScale: number;
    };
    push: {
        dailyEnabled: boolean;
        dailyTime: string;
        weeklyEnabled: boolean;
        weeklyWeekday: number;
        weeklyTime: string;
        monthlyEnabled: boolean;
        monthlyTime: string;
        targets: TargetSeed[];
    };
    /** 第三方开放平台密钥（联盟/推客） */
    api: {
        jd: {
            appKey: string;
            appSecret: string;
        };
        pdd: {
            clientId: string;
            clientSecret: string;
        };
        taobao: {
            appKey: string;
            appSecret: string;
        };
    };
    /** 外部数据接入（给用户自己的爬虫用） */
    ingest?: {
        token?: string;
        enabled?: boolean;
    };
    /** 反爬协议开关（隔离模块，默认关闭；协议失效只熔断自己） */
    anti?: {
        enabled?: boolean;
        jd?: {
            enabled?: boolean;
        };
        pdd?: {
            enabled?: boolean;
        };
        taobao?: {
            enabled?: boolean;
        };
    };
    /** 每个平台的数据源：auto = 有密钥走 API，否则走浏览器 */
    source: {
        jd: DataSource;
        pdd: DataSource;
        taobao: DataSource;
    };
    collect: {
        fullTime: string;
        patchTime: string;
        patchEnabled: boolean;
        jitterSeconds: number;
        intervalSeconds: number;
        dailyCap: number;
        timeoutMs: number;
        samples: number;
        maxOffers: number;
        browserEnabled: boolean;
        browserHeadless: boolean;
        keepLoginWindow: boolean;
        loginHeaded: boolean;
        switchSku: boolean;
        discoverLimit: number;
        browserPath?: string;
        profileDir: string;
    };
    data: {
        snapshotDays: number;
        dailyDays: number;
        weekDays: number;
        sizeWarnMB: number;
    };
    alert: {
        enabled: boolean;
        r7Threshold: number;
        dailyDropThreshold: number;
        newLowEnabled: boolean;
        perChannelDaily: number;
    };
    advanced: {
        debug: boolean;
        dryRun: boolean;
        preset: 'default' | 'none';
        owners: string[];
        loginMode: 'auto' | 'window' | 'qrcode';
        qrTimeout: number;
        maxRetry: number;
        loginStepTimeout: number;
        textLimit: number;
    };
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
declare module 'koishi' {
    interface Context {
        priceWatch?: {
            config: Config;
            rebuild: (modelIds?: string[]) => Promise<{
                daily: number;
                stat: number;
            }>;
        };
    }
}
