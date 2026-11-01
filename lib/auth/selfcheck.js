"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLoginSelfCheck = runLoginSelfCheck;
const browser_1 = require("../crawler/browser");
const login_1 = require("./login");
const methods_1 = require("./methods");
async function probeLoginPage(ctx, config, url) {
    try {
        const res = await ctx.http.get(url, {
            timeout: Math.min(10000, config.collect.timeoutMs),
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
            },
        });
        const status = res?.status ?? 200;
        return `HTTP ${status}`;
    }
    catch (error) {
        return `不可达（${error.message.slice(0, 40)}）`;
    }
}
async function runLoginSelfCheck(ctx, config) {
    const platforms = ['pdd', 'jd', 'taobao'];
    const rows = [];
    for (const platform of platforms) {
        const spec = methods_1.LOGIN_SPECS[platform];
        const info = await (0, login_1.inspectPlatform)(ctx, config, platform).catch(() => null);
        const pageStatus = spec ? await probeLoginPage(ctx, config, spec.url) : '无登录页';
        // 只有「行为验证」会启浏览器，而且只导航、不截图
        const live = spec && config.collect.browserEnabled
            ? await (0, login_1.verifyLogin)(ctx, config, platform).catch(() => null)
            : null;
        rows.push({
            platform,
            method: spec?.methodLabel ?? '未定义',
            specOk: !!spec,
            browserOk: config.collect.browserEnabled,
            profileExists: info?.profileExists ?? false,
            profilePath: info?.profilePath ?? (0, browser_1.profileDirOf)(config, platform),
            cookieCount: info?.cookieCount ?? 0,
            pageStatus,
            loggedIn: live ? live.loggedIn : null,
            detail: live?.detail ?? (config.collect.browserEnabled ? '未验证' : '浏览器未开启'),
        });
        // 行为验证不开窗口，这里只是兜底清理，避免占用 profile 目录
        await (0, login_1.clearActiveLogin)(ctx).catch(() => undefined);
        if (!live?.loggedIn)
            await (0, login_1.skipLogin)(ctx, platform).catch(() => undefined);
    }
    const zh = { jd: '京东', pdd: '拼多多', taobao: '淘宝' };
    const lines = ['登录自检（只查能不能登录 / 是否已登录，不做二维码）：', ''];
    for (const row of rows) {
        const stateText = row.loggedIn === null ? '未验证' : row.loggedIn ? '已登录' : '未登录';
        lines.push(`${row.loggedIn ? '✓' : '·'} ${zh[row.platform] ?? row.platform}　${stateText}`);
        lines.push(`   登录方式：${row.specOk ? row.method : '✗ 未定义'}`);
        lines.push(`   浏览器：${row.browserOk ? '已开启' : '✗ 未开启'}`);
        lines.push(`   登录页：${row.pageStatus}`);
        lines.push(`   profile：${row.profileExists ? `存在（${row.cookieCount} 个 cookie）` : '尚未创建'}`);
        if (row.loggedIn === false)
            lines.push(`   判定：${row.detail}`);
        if (!row.loggedIn && row.browserOk)
            lines.push(`   下一步：价格 管理 登录 ${zh[row.platform] ?? row.platform}`);
        lines.push('');
    }
    const ready = rows.filter((row) => row.specOk && row.browserOk && row.pageStatus.startsWith('HTTP')).length;
    const logged = rows.filter((row) => row.loggedIn).length;
    lines.push(`结论：${ready}/${rows.length} 个平台具备登录条件，${logged} 个已登录。`);
    if (ready < rows.length)
        lines.push('有平台不具备条件：先确认浏览器已开启、网络可达。');
    else if (!logged)
        lines.push('条件都齐但都未登录，发「价格 管理 登录」扫码即可。');
    const jdState = await (0, login_1.getAuthState)(ctx, 'jd');
    if (jdState === 'pending')
        lines.push('（京东状态停在「登录中」，说明上次流程没走完，重新发起一次即可。）');
    return lines.join('\n');
}
//# sourceMappingURL=selfcheck.js.map