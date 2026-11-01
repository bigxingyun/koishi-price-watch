/**
 * 性能基准与性价比。
 *
 * 为什么需要一份「内置分数表」：价格 API 只给价格，**没有性能**。
 * 性价比 = 性能 / 价格，没有性能分就算不出来。所以这里内置一份可维护的参考分，
 * 并明确标注它是**参考值**（3DMark Time Spy 显卡分，近似取值，可手工修订）。
 *
 * 内存/固态不用性能分，直接用「每 GB 价格」，这才是这两个品类真正有意义的性价比。
 */
export interface BenchRow {
    /** 匹配型号名的关键字（按顺序优先匹配，越具体的放前面） */
    match: string;
    /** 3DMark Time Spy 近似分 */
    score: number;
    note?: string;
}
/** 找型号对应的性能分；认不出返回 null（不瞎猜） */
export declare function scoreOfGpu(name: string): number | null;
/** 从型号名里抠容量（GB）：16G / 16GB / 1TB / 2T 都认 */
export declare function capacityOf(name: string): number | null;
export interface ValueRow {
    name: string;
    price: number;
    /** GPU：性能分；内存/固态：容量 GB */
    metric: number;
    /** 性价比分：GPU = 性能/价格×1000；内存/固态 = 价格/GB（越低越好） */
    value: number;
    /** 越高越好还是越低越好 */
    higherIsBetter: boolean;
    unit: string;
}
/** 显卡性价比：每 100 元买到多少性能分 */
export declare function gpuValue(name: string, priceYuan: number): ValueRow | null;
/** 内存/固态性价比：每 GB 多少钱（越低越好） */
export declare function capacityValue(name: string, priceYuan: number, unit?: string): ValueRow | null;
