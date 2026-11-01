import { Context, type Fragment, Session } from 'koishi';
import { type Category } from '../constants';
import type { Config } from '../index';
import { type PlatformFilter, type ReportKind } from '../render/model';
import type { ThemeKey } from '../render/themes';
export interface Scope {
    platform: string;
    channelId: string;
    userId: string;
}
export declare function scopeOf(session: Session | undefined): Scope | null;
/** 中文品类别名 */
export declare function parseCategory(input?: string): Category | undefined;
export declare function handleQuery(ctx: Context, config: Config, query?: string): Promise<string>;
export declare function handleTrend(ctx: Context, config: Config, query?: string, days?: number, platformInput?: string): Promise<string>;
export declare function handleList(ctx: Context, config: Config, category?: string): Promise<string>;
export declare function handleTop(ctx: Context, config: Config, count?: number): Promise<string>;
export declare function handleSubscribe(ctx: Context, scope: Scope | null, query?: string): Promise<string>;
export declare function handleUnsubscribe(ctx: Context, scope: Scope | null, query?: string): Promise<string>;
export declare function handleSubList(ctx: Context, scope: Scope | null): Promise<string>;
export interface ReportRequest {
    kind: ReportKind;
    platform?: PlatformFilter | string;
    image?: boolean;
    markdown?: boolean;
    /** 主题覆盖（不传则用配置里的默认主题） */
    theme?: ThemeKey;
    /** 没显式指定形态时，按配置里的默认形态决定 */
    auto?: boolean;
}
export declare function handleReport(ctx: Context, config: Config, session: Session | undefined, request: ReportRequest): Promise<Fragment>;
export declare function sparkline(points: number[], width?: number): string;
export declare function mountPriceCommands(ctx: Context, config: Config): void;
