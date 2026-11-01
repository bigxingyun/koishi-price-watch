import type { Adapter } from '../crawler/types';
/**
 * 生成一个稳定的价格（分）。
 *
 * 关键：同一型号的多个平台必须共享基准价，只叠加 ±3% 的平台偏移。
 * 否则各平台基准价相差数倍，一旦某天某个平台缺货，「代表价」就会剧烈跳动，
 * 指标全被假波动污染（这是第一版踩到的坑）。
 */
export declare function mockPriceFor(itemId: string, day: number, modelId?: string): number;
export declare const mockAdapter: Adapter;
