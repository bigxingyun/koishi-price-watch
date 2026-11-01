import type { Context } from 'koishi';
import type { Config } from '../index';
export interface ProbeResult {
    platform: string;
    keyword: string;
    search: unknown;
    item: unknown;
    text: string;
}
export declare function probePlatform(ctx: Context, config: Config, platform: string, keyword: string): Promise<ProbeResult>;
