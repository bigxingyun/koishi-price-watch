"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.both = both;
function both(ctx, names, desc, setup) {
    const [en, zh] = names;
    setup(ctx.command(en, desc));
    if (zh && zh !== en)
        setup(ctx.command(zh, desc));
}
//# sourceMappingURL=register.js.map