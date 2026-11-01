import type { Adapter } from '../crawler/types';
import { manualAdapter } from './manual';
import { mockAdapter } from './mock';
import { taobaoAdapter } from './taobao';
export declare function getAdapter(platform: string): Adapter | undefined;
export declare function listPlatforms(): string[];
export { taobaoAdapter, manualAdapter, mockAdapter };
