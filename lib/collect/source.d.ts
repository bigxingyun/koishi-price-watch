import type { Context } from 'koishi';
import type { Config, DataSource } from '../index';
/**
 * 数据源决策（混合模式的核心）。
 *
 * 优先级：**聊天里临时设置 > 配置 > auto 兜底**
 * - 聊天里设置：`价格 管理 数据源 京东 api`，存在 pw_meta（`source:jd`），重启不丢
 * - 配置：插件配置「数据源」分组，是长期默认
 * - auto：有密钥就用 API，没密钥但有浏览器就用浏览器，两者都没有就 manual
 *
 * 这样「用户自己决定走 api 还是爬虫」在运行时就能改，不用重启、不用编辑配置文件。
 */
export interface SourceDecision {
    source: DataSource;
    /** 为什么选它 —— 自检和状态里要显示，避免用户以为设置没生效 */
    reason: string;
    /** 是否来自聊天里的临时设置 */
    fromChat: boolean;
}
export declare function sourceOf(config: Config, platform: string): DataSource;
export declare function resolveSource(ctx: Context, config: Config, platform: string): Promise<SourceDecision>;
export declare function setSource(ctx: Context, platform: string, source: DataSource | 'clear'): Promise<void>;
/** 给状态命令用：三个平台的最终数据源 */
export declare function sourceTable(ctx: Context, config: Config): Promise<Array<SourceDecision & {
    platform: string;
}>>;
