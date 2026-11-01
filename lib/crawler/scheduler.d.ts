import { Context } from 'koishi';
import type { Config } from '../index';
/** 当天的计划触发时刻（含按天稳定的抖动，避免每天同一秒打请求） */
export declare function plannedAt(day: number, hhmm: string, jitterSeconds: number): Date;
export declare function mountScheduler(ctx: Context, config: Config): void;
