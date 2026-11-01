import type { PageLike } from './browser';
/**
 * 二维码提取（不引入二维码库）。
 *
 * 踩过的两个坑：
 * 1. **靠 class 名找会漏**：拼多多登录页有「扫一扫」字样，但二维码元素的 class/id 里
 *    没有任何 qr/code 字样（实测 2026-10）。
 * 2. **直接读 canvas 会被跨域污染**：京东的二维码是 `qr.m.jd.com` 的图片，
 *    画到 canvas 后 `getImageData` 直接抛 SecurityError。
 *
 * 所以做法是：
 *   a) 在页面里按「尺寸/比例/类名线索」找候选元素，只取 boundingRect（不需要读像素）
 *   b) 用 Playwright 对每个候选**截图**（合成器截图不受跨域限制）
 *   c) 把这张 PNG 以 dataURL 送回页面，页面里用 `Image` 解码后画到干净的 canvas 上读像素
 *      （data: URL 同源，可读）
 *   d) 用左上角定位图案反推模块尺寸，验证模块数，产出矩阵
 *
 * 这样既不需要二维码解码库，也不受跨域影响，还能顺便拿到矩阵在控制台打印。
 */
export interface QrCapture {
    /** 裁剪放大后的二维码 PNG */
    image: Buffer;
    /** true = 黑模块 */
    matrix: boolean[][];
    modules: number;
    size: {
        width: number;
        height: number;
    };
}
/** 尝试切换到扫码 tab，返回被点击的文案 */
export declare function activateQrTab(page: PageLike): Promise<string | null>;
export interface DetectResult {
    dataUrl: string;
    matrix: boolean[][];
    modules: number;
    size: {
        width: number;
        height: number;
    };
}
/**
 * 在页面里找二维码并提取。
 * 找到返回图片 + 矩阵；找不到返回 null（由调用方决定兜底策略）。
 */
export declare function captureQr(page: PageLike): Promise<QrCapture | null>;
/** 兼容旧调用名 */
export declare const detectQr: typeof captureQr;
/** dataURL → Buffer */
export declare function dataUrlToBuffer(dataUrl: string): Buffer;
/**
 * 把矩阵画成控制台字符画。
 * 用半块字符（▀▄█）一行画两行模块：终端格子高约是宽的两倍，这样长宽比才对。
 */
export declare function renderQrForConsole(matrix: boolean[][], indent?: string): string;
/** 打印到控制台（不走 logger，避免时间戳插进二维码中间） */
export declare function printQrToConsole(matrix: boolean[][], title: string): void;
