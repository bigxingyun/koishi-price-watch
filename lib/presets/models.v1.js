"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_MODELS = exports.PRESET_VERSION = void 0;
exports.PRESET_VERSION = 1;
exports.PRESET_MODELS = [
    // ── 显卡 12 ───────────────────────────────
    { id: 'gpu:rtx5090-32g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 5090 32G', aliases: ['5090', 'rtx5090', '5090 32g'], inIndex: true, priority: 10 },
    { id: 'gpu:rtx5080-16g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 5080 16G', aliases: ['5080', 'rtx5080', '5080 16g'], inIndex: true, priority: 9 },
    { id: 'gpu:rtx5070ti-16g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 5070 Ti 16G', aliases: ['5070ti', '5070 ti', 'rtx5070ti'], inIndex: true, priority: 8 },
    { id: 'gpu:rtx5070-12g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 5070 12G', aliases: ['5070', 'rtx5070', '5070 12g'], inIndex: true, priority: 8 },
    { id: 'gpu:rtx5060ti-16g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 5060 Ti 16G', aliases: ['5060ti', '5060 ti', 'rtx5060ti'], inIndex: true, priority: 7 },
    { id: 'gpu:rtx5060-8g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 5060 8G', aliases: ['5060', 'rtx5060', '5060 8g'], inIndex: true, priority: 7 },
    { id: 'gpu:rtx4060-8g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 4060 8G', aliases: ['4060', 'rtx4060'], inIndex: true, priority: 5 },
    { id: 'gpu:rx9070xt-16g', category: 'gpu', brand: 'AMD', name: 'RX 9070 XT 16G', aliases: ['9070xt', '9070 xt', 'rx9070xt'], inIndex: true, priority: 8 },
    { id: 'gpu:rx9070-16g', category: 'gpu', brand: 'AMD', name: 'RX 9070 16G', aliases: ['9070', 'rx9070'], inIndex: true, priority: 7 },
    { id: 'gpu:rx9060xt-16g', category: 'gpu', brand: 'AMD', name: 'RX 9060 XT 16G', aliases: ['9060xt', '9060 xt', 'rx9060xt'], inIndex: true, priority: 6 },
    { id: 'gpu:arc-b580-12g', category: 'gpu', brand: 'Intel', name: 'Arc B580 12G', aliases: ['b580', 'arc b580'], inIndex: true, priority: 4 },
    { id: 'gpu:rtx3060-12g', category: 'gpu', brand: 'NVIDIA', name: 'RTX 3060 12G', aliases: ['3060', 'rtx3060'], inIndex: true, priority: 3 },
    // ── 内存 8 ────────────────────────────────
    { id: 'ram:ddr5-6000-16gx2', category: 'ram', brand: '通用', name: 'DDR5 6000 16G×2', aliases: ['ddr5 6000 16g', '6000 16gx2', '6000 16×2'], inIndex: true, priority: 9 },
    { id: 'ram:ddr5-6000-32gx2', category: 'ram', brand: '通用', name: 'DDR5 6000 32G×2', aliases: ['ddr5 6000 32g', '6000 32gx2'], inIndex: true, priority: 8 },
    { id: 'ram:ddr5-6400-16gx2', category: 'ram', brand: '通用', name: 'DDR5 6400 16G×2', aliases: ['ddr5 6400', '6400 16gx2'], inIndex: true, priority: 7 },
    { id: 'ram:ddr5-5600-16gx2', category: 'ram', brand: '通用', name: 'DDR5 5600 16G×2', aliases: ['ddr5 5600', '5600 16gx2'], inIndex: true, priority: 6 },
    { id: 'ram:ddr5-5600-32g-sodimm', category: 'ram', brand: '通用', name: 'DDR5 5600 32G 笔记本', aliases: ['ddr5 笔记本 32g', 'sodimm 5600 32g'], inIndex: true, priority: 5 },
    { id: 'ram:ddr5-4800-16gx2-sodimm', category: 'ram', brand: '通用', name: 'DDR5 4800 16G×2 笔记本', aliases: ['ddr5 笔记本 16g', 'sodimm 4800'], inIndex: true, priority: 4 },
    { id: 'ram:ddr4-3200-16gx2', category: 'ram', brand: '通用', name: 'DDR4 3200 16G×2', aliases: ['ddr4 3200', '3200 16gx2'], inIndex: true, priority: 6 },
    { id: 'ram:ddr4-3600-8gx2', category: 'ram', brand: '通用', name: 'DDR4 3600 8G×2', aliases: ['ddr4 3600', '3600 8gx2'], inIndex: true, priority: 5 },
    // ── SSD 8 ─────────────────────────────────
    { id: 'ssd:990pro-2t', category: 'ssd', brand: '三星', name: '990 PRO 2TB', aliases: ['990pro 2t', '990 pro 2t', '990pro'], inIndex: true, priority: 9 },
    { id: 'ssd:990pro-1t', category: 'ssd', brand: '三星', name: '990 PRO 1TB', aliases: ['990pro 1t', '990 pro 1t'], inIndex: true, priority: 8 },
    { id: 'ssd:9100pro-2t', category: 'ssd', brand: '三星', name: '9100 PRO 2TB', aliases: ['9100pro', '9100 pro 2t'], inIndex: true, priority: 7 },
    { id: 'ssd:sn850x-2t', category: 'ssd', brand: '西数', name: 'SN850X 2TB', aliases: ['sn850x 2t', '850x 2t'], inIndex: true, priority: 7 },
    { id: 'ssd:sn850x-1t', category: 'ssd', brand: '西数', name: 'SN850X 1TB', aliases: ['sn850x 1t', '850x 1t'], inIndex: true, priority: 6 },
    { id: 'ssd:tiplus7100-2t', category: 'ssd', brand: '致态', name: 'TiPlus7100 2TB', aliases: ['tiplus7100', '7100 2t'], inIndex: true, priority: 6 },
    { id: 'ssd:tipro7000-2t', category: 'ssd', brand: '致态', name: 'TiPro7000 2TB', aliases: ['tipro7000', '7000 2t'], inIndex: true, priority: 5 },
    { id: 'ssd:kc3000-1t', category: 'ssd', brand: '金士顿', name: 'KC3000 1TB', aliases: ['kc3000', 'kc3000 1t'], inIndex: true, priority: 4 },
];
//# sourceMappingURL=models.v1.js.map