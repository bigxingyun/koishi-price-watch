"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthState = getAuthState;
exports.setAuthState = setAuthState;
exports.requestLogin = requestLogin;
exports.matchLoginCookie = matchLoginCookie;
exports.snapshotCookies = snapshotCookies;
exports.snapshotChanged = snapshotChanged;
exports.quickCheckLogin = quickCheckLogin;
exports.verifyLogin = verifyLogin;
exports.confirmLogin = confirmLogin;
exports.skipLogin = skipLogin;
exports.evaluateCookies = evaluateCookies;
exports.inspectPlatform = inspectPlatform;
exports.authReport = authReport;
exports.loginSelfCheck = loginSelfCheck;
exports.beginActiveLogin = beginActiveLogin;
exports.clearActiveLogin = clearActiveLogin;
exports.resumeLoginWatch = resumeLoginWatch;
exports.isLoginWatching = isLoginWatching;
exports.stopLoginWatch = stopLoginWatch;
exports.startLoginWatch = startLoginWatch;
const browser_1 = require("../crawler/browser");
const fetcher_1 = require("../crawler/fetcher");
const guard_1 = require("../crawler/guard");
const probe_1 = require("../crawler/probe");
const repo = __importStar(require("../store/repo"));
const methods_1 = require("./methods");
const qr_1 = require("../crawler/qr");
/** 各平台登录成功后应该出现的 cookie 名 */
const COOKIE_HINTS = {
    jd: /pt_key|pt_pin/,
    taobao: /cookie2|_tb_token_|sgcookie/,
    pdd: /PDDAccessToken|pdd_user_id|api_uid/,
};
/** 登录后才打得开的页面：被重定向到登录域就说明没登录（行为验证，比 cookie 名可靠） */
const MEMBER_URL = {
    jd: 'https://home.m.jd.com/',
    taobao: 'https://member1.taobao.com/member/fresh/member_index.htm',
    pdd: 'https://mobile.yangkeduo.com/login.html',
};
const PLATFORM_ZH = { jd: '京东', taobao: '淘宝', pdd: '拼多多' };
const loginPages = new WeakMap();
const lastQrAt = new WeakMap();
/** 二维码大约 60 秒过期，45 秒就换一张，避免用户扫到失效的码 */
const QR_REFRESH_MS = 45_000;
function rememberPage(ctx, platform, page) {
    let map = loginPages.get(ctx);
    if (!map) {
        map = new Map();
        loginPages.set(ctx, map);
    }
    map.set(platform, page);
}
function forgetPage(ctx, platform) {
    loginPages.get(ctx)?.delete(platform);
}
async function readOpenPage(ctx, platform) {
    const page = loginPages.get(ctx)?.get(platform);
    if (!page)
        return null;
    try {
        return (await page.evaluate('({ href: location.href, title: document.title })'));
    }
    catch {
        forgetPage(ctx, platform);
        return null;
    }
}
async function getAuthState(ctx, platform) {
    const value = await repo.metaGet(ctx, `auth:${platform}`);
    if (value === 'ok' || value === 'expired' || value === 'pending' || value === 'failed')
        return value;
    return 'unknown';
}
async function setAuthState(ctx, platform, state) {
    await repo.metaSet(ctx, `auth:${platform}`, state);
    await repo.metaSet(ctx, `authAt:${platform}`, String(Date.now()));
}
/** 记录「扫码前」的 cookie 指纹，之后只要 pdd_user_id 这类值变了，就说明真的登录了 */
async function saveBaseline(ctx, config, platform) {
    try {
        const snapshot = await snapshotCookies(ctx, config, platform);
        await repo.metaSet(ctx, `authBase:${platform}`, JSON.stringify(snapshot));
    }
    catch { /* 记不上就退回其它判据 */ }
}
async function readBaseline(ctx, platform) {
    const raw = await repo.metaGet(ctx, `authBase:${platform}`);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/** 基线里有没有、现在值变了没有 —— 真正的「扫码生效」证据 */
function changedSince(platform, baseline, current) {
    if (!baseline)
        return [];
    const names = [];
    for (const rule of DEFINITIVE[platform] ?? []) {
        const cookie = current.find((c) => c.name === rule.name);
        if (!cookie)
            continue;
        const now = fingerprint(cookie.value);
        if (baseline[rule.name] !== now)
            names.push(rule.name);
    }
    return names;
}
/**
 * 开始登录某平台：开窗口 / 截二维码。
 * 窗口会**保持打开**，直到用户发「确认」或「跳过」。
 */
async function requestLogin(ctx, config, platform, options = {}) {
    const spec = (0, methods_1.loginSpecOf)(platform);
    const zh = PLATFORM_ZH[platform] ?? platform;
    if (!spec) {
        return { ok: false, platform, message: `暂不支持 ${platform} 的登录` };
    }
    if (!config.collect.browserEnabled) {
        return {
            ok: false,
            platform,
            method: spec.method,
            message: '浏览器采集没开，登录无法取窗口/二维码。请到配置「采集 → 用真实浏览器抓」打开。',
        };
    }
    // 拼多多没有扫码登录，必须有可见窗口；无头模式下没有窗口可操作
    if (spec.method === 'window' && config.collect.browserHeadless && !options.forceWindow) {
        await setAuthState(ctx, platform, 'failed');
        return {
            ok: false,
            platform,
            method: 'window',
            needsWindow: true,
            message: [
                `${zh}没有扫码登录，只能在弹出的浏览器窗口里用手机号 + 验证码登录。`,
                '',
                '但现在「无头模式」是开着的，没有窗口可以操作。两个办法：',
                '  1. 直接发：价格 管理 登录 拼多多 --window（临时开一个窗口，不改配置）',
                '  2. 或到配置「采集 → 浏览器在后台无界面运行」把它关掉，再发一次登录',
                '  3. 或先跳过拼多多（价格 管理 登录 跳过），只登京东/淘宝',
            ].join('\n'),
        };
    }
    await setAuthState(ctx, platform, 'pending');
    try {
        // 登录是面向人的操作：默认开可见窗口，用户能直接扫窗口里的码
        // 服务器（Linux 无桌面）开不出可见窗口，自动退回「聊天里发二维码图片」
        const canShowWindow = process.platform !== 'linux' || !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
        const headed = spec.method === 'window' || (config.collect.loginHeaded !== false && canShowWindow);
        // 上一次的浏览器如果没退干净，同一个 profile 目录会被锁住（Chrome 直接退出）。
        // 这里先关掉旧窗口再重开一次，避免用户看到「登录窗口已经开着」却无窗口可用。
        let session;
        try {
            session = await (0, browser_1.keepLoginWindow)(ctx, config, platform, headed, spec.desktopUA ? { width: 1280, height: 900 } : { width: 420, height: 780 });
        }
        catch (error) {
            if (!/已经开着|already in use|exitCode=21/i.test(error.message))
                throw error;
            await (0, browser_1.closeLoginWindow)(ctx, platform).catch(() => undefined);
            await new Promise((resolve) => setTimeout(resolve, 800));
            session = await (0, browser_1.keepLoginWindow)(ctx, config, platform, headed, spec.desktopUA ? { width: 1280, height: 900 } : { width: 420, height: 780 });
        }
        const page = await session.browser.newPage({
            // 视口宽度会决定平台给哪套页面：淘宝/京东的扫码页只在桌面布局里出现，
            // 用 420 宽会被判成移动版（只剩手机号登录），所以桌面 UA 必须配桌面视口。
            viewport: spec.desktopUA ? { width: 1280, height: 900 } : { width: 420, height: 780 },
            userAgent: (0, methods_1.loginUaOf)(spec, fetcher_1.MOBILE_UA),
            isMobile: !spec.desktopUA,
            hasTouch: !spec.desktopUA,
        });
        // 句柄必须在这里记：后面无论走二维码还是截图兜底，检测器都要读这个页面的实时 URL
        rememberPage(ctx, platform, page);
        if (!page.goto)
            throw new Error('浏览器实现不支持 goto');
        await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
        await new Promise((resolve) => setTimeout(resolve, 3500));
        // 已登录的平台：打开登录页会被直接重定向到会员页/首页，这时不该再要求扫码
        const landed = await page.evaluate('({ href: location.href, title: document.title })').catch(() => null);
        const landedHref = landed?.href ?? '';
        const landedTitle = (landed?.title ?? '').trim();
        const stillLogin = platform === 'pdd'
            ? /login\.html/i.test(landedHref) || /^登录$/.test(landedTitle)
            : /login\.|passport\.|\/login/i.test(landedHref);
        if (landed && !stillLogin) {
            await saveBaseline(ctx, config, platform);
            await beginActiveLogin(ctx, config, platform, options.origin);
            return {
                ok: true,
                platform,
                method: spec.method,
                message: `已经是登录状态（页面跳到了 ${landedHref.slice(0, 60)}），这一步不用扫码。`,
            };
        }
        // 主动在页面里找二维码（按像素特征找，不靠 class 名猜）
        const found = await (0, qr_1.captureQr)(page);
        if (found) {
            rememberPage(ctx, platform, page);
            await saveBaseline(ctx, config, platform);
            await beginActiveLogin(ctx, config, platform, options.origin);
            const image = found.image;
            // 各平台统一：除裁剪图外，再给一张整页截图（能看清当前停在哪个登录方式）
            const fullPage = await page.screenshot({ type: 'png' }).catch(() => undefined);
            // 这里只返回「正文」：标题、进度、超时提醒统一由 wizard 组装，避免两边各写一套导致文案重复
            return {
                ok: true,
                platform,
                method: 'qrcode',
                qr: image,
                fullPage,
                matrix: found.matrix,
                message: [
                    found.modules
                        ? `已定位二维码（${found.modules}×${found.modules} 模块）`
                        : '已定位到二维码区域',
                    headed ? '扫上面这张，或扫弹出的窗口里的码。' : '直接扫上面这张图。',
                ].join('\n'),
            };
        }
        if (headed) {
            rememberPage(ctx, platform, page);
            await beginActiveLogin(ctx, config, platform, options.origin);
            await saveBaseline(ctx, config, platform);
            return {
                ok: true,
                platform,
                method: 'window',
                needsWindow: true,
                fullPage: await page.screenshot({ type: 'png' }).catch(() => undefined),
                message: '页面里没找到二维码元素，直接在弹出的浏览器窗口里完成登录（窗口先别关）。',
            };
        }
        // 最后的兜底：整页截图（能用，但不如裁剪后的清楚）
        const shot = await page.screenshot({ type: 'png' });
        return {
            ok: true,
            platform,
            method: 'qrcode',
            qr: shot,
            fullPage: shot,
            message: '没定位到二维码元素，下面是整页截图，二维码在页面里自己找一下。',
        };
    }
    catch (error) {
        await setAuthState(ctx, platform, 'failed');
        return {
            ok: false,
            platform,
            method: spec.method,
            message: `获取${zh}登录页面失败：${error.message}`,
        };
    }
}
/**
 * 纯函数：从 cookie 名单里找登录凭据。
 * 单独抽出来是为了能单测——这类判断出错会导致「登录了却说没登录」。
 */
function matchLoginCookie(platform, names) {
    const hint = COOKIE_HINTS[platform];
    if (!hint)
        return { hit: names.length > 0, matched: [] };
    const matched = names.filter((name) => hint.test(name));
    return { hit: matched.length > 0, matched };
}
/** 各平台的关键 cookie：值一变就说明换了会话（登录成功会换） */
const KEY_COOKIES = {
    jd: ['pt_key', 'pt_pin', 'pin', 'thor'],
    taobao: ['cookie2', '_tb_token_', 'unb', '_l_g_', 'sgcookie'],
    pdd: ['PDDAccessToken', 'pdd_user_id', 'api_uid', 'pdd_uid'],
};
/** cookie 值不存明文，只存指纹（长度 + 前 6 位），足够判断变没变 */
function fingerprint(value) {
    let sum = 0;
    for (let i = 0; i < value.length; i++)
        sum = (sum * 31 + value.charCodeAt(i)) % 1000000007;
    return `${value.length}:${sum}`;
}
/** 读当前平台 profile 的全部 cookie */
async function readCookies(ctx, config, platform) {
    const browser = (0, browser_1.getLoginWindow)(ctx, platform)?.browser ?? await (0, browser_1.acquireProfile)(ctx, config, platform);
    try {
        return (await browser.cookies?.()) ?? [];
    }
    catch {
        return [];
    }
}
/**
 * 记录当前平台的 cookie 指纹快照。
 *
 * 为什么要这个：拼多多的 PDDAccessToken / 淘宝的 cookie2 在**未登录时也会存在**，
 * 光看「有没有」会误判成已登录；而京东的 pt_key 是 HttpOnly，看 document.cookie 又读不到。
 * 所以用「**值变了没有**」来判断：登录成功一定会换会话。
 */
async function snapshotCookies(ctx, config, platform) {
    const snapshot = {};
    const browser = (0, browser_1.getLoginWindow)(ctx, platform)?.browser ?? await (0, browser_1.acquireProfile)(ctx, config, platform);
    if (!browser.cookies)
        return snapshot;
    try {
        const cookies = await browser.cookies();
        const wanted = KEY_COOKIES[platform] ?? [];
        for (const cookie of cookies) {
            if (!wanted.includes(cookie.name))
                continue;
            snapshot[cookie.name] = fingerprint(cookie.value);
        }
    }
    catch { /* 读不到就返回空快照 */ }
    return snapshot;
}
/**
 * 快速判断「登录态是否发生变化」——不打开页面，只读 cookie，适合每 2 秒轮询一次。
 *
 * 判定规则：
 * 1. 京东的 pt_key 出现 = 已登录（最强信号）
 * 2. 任意关键 cookie 的值与快照不同 = 会话换了 = 已登录
 *
 * 注意：这是「可能已登录」，最终确认仍走 verifyLogin 的行为验证。
 */
function snapshotChanged(platform, before, after) {
    if (!before)
        return { changed: false, reason: '没有初始快照' };
    if (platform === 'jd' && after.pt_key) {
        return { changed: true, reason: '出现 pt_key' };
    }
    const differed = [];
    for (const [name, value] of Object.entries(after)) {
        if (before[name] && before[name] !== value)
            differed.push(name);
        else if (!before[name])
            differed.push(`${name}(新增)`);
    }
    if (differed.length)
        return { changed: true, reason: `cookie 变化：${differed.slice(0, 3).join(', ')}` };
    return { changed: false, reason: 'cookie 没有变化' };
}
/** 轮询用：cookie 变没变（不导航，快） */
async function quickCheckLogin(ctx, config, platform, before) {
    // 自动检查也走行为验证：cookie 名在匿名会话里也可能存在（PDDAccessToken/cookie2），
    // 拿它当登录证据会把「没登录」误报成「已登录」。
    const result = await verifyLogin(ctx, config, platform);
    return { loggedIn: result.loggedIn, reason: result.detail };
}
/** 去目标站点读一次 document.cookie，看有没有登录凭据 */
async function verifyLogin(ctx, config, platform) {
    const zh = PLATFORM_ZH[platform] ?? platform;
    // 统一规则：打开该平台自己的登录页。
    // 已登录会被重定向走（京东→首页、淘宝→我的淘宝、拼多多→portal），
    // 未登录则停在登录页。这比「会员页可访问」可靠，也和 requestLogin 的判定一致。
    const spec = (0, methods_1.loginSpecOf)(platform);
    const url = spec?.url ?? MEMBER_URL[platform];
    if (!url)
        return { loggedIn: false, detail: `没有为 ${platform} 配置校验地址` };
    /**
     * 判定方式：**行为验证**优先。
     *
     * 为什么不能只看 cookie 名：拼多多的 PDDAccessToken / 淘宝的 cookie2 在**未登录时也会存在**
     * （设备指纹），只看名字会误判成「已登录」。而京东真正代表登录的 pt_key 是 HttpOnly，
     * 用 document.cookie 永远读不到 —— 只看页面 cookie 会误判成「没登录」。
     *
     * 所以：打开「只有登录后才能看的会员页」，被重定向到登录域 = 没登录；能正常打开 = 登录了。
     * cookie 名只用来在提示里补一句证据。
     */
    // 先看已打开的登录页：不导航就不会刷新二维码
    const openPage = await readOpenPage(ctx, platform);
    if (openPage) {
        const kicked = platform === 'pdd'
            ? (/login\.html/i.test(openPage.href) || /^登录$/.test(openPage.title.trim()))
            : ((0, probe_1.isLoginDomain)(openPage.href) || /登录|扫码登录|sign\\s*in/i.test(openPage.title));
        const cookies = await readCookies(ctx, config, platform);
        const check = evaluateCookies(platform, cookies);
        // 拼多多登录后页面不一定跳转，但会话 cookie 的值一定会变（相对扫码前基线）
        const changed = changedSince(platform, await readBaseline(ctx, platform), cookies);
        if (changed.length) {
            return {
                loggedIn: true,
                detail: `${PLATFORM_ZH[platform] ?? platform}已登录（${changed.join('/')} 已更新）`,
            };
        }
        return {
            loggedIn: !kicked,
            detail: kicked
                ? `${PLATFORM_ZH[platform] ?? platform}未登录（${check.evidence}）`
                : `${PLATFORM_ZH[platform] ?? platform}已登录：页面已跳转（${check.evidence}）`,
        };
    }
    const check = async (browser) => {
        let cookieList = [];
        if (browser.cookies) {
            try {
                cookieList = (await browser.cookies()).map((c) => ({ name: c.name, value: c.value }));
            }
            catch { /* 读不到就只能靠页面判断 */ }
        }
        const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
        const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
        const mobile = platform === 'pdd';
        const page = await browser.newPage({
            viewport: mobile ? { width: 414, height: 896 } : { width: 1280, height: 900 },
            userAgent: mobile ? MOBILE_UA : DESKTOP_UA,
            ...(mobile ? { isMobile: true, hasTouch: true } : {}),
        });
        try {
            if (!page.goto)
                throw new Error('浏览器实现不支持 goto');
            // 每个平台的「证明自己已登录」的页面不同，用错了就会永远判未登录：
            //   淘宝 → 打开登录页会被重定向到 i.taobao.com
            //   京东 → 打开个人中心会被重定向到 plogin.m.jd.com
            //   拼多多 → 登录页**从不跳转**，必须看个人中心里有没有订单入口
            const probeUrl = platform === 'pdd'
                ? 'https://mobile.yangkeduo.com/personal.html'
                : platform === 'jd'
                    ? 'https://home.jd.com/'
                    : url;
            await page.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: config.collect.timeoutMs });
            await new Promise((resolve) => setTimeout(resolve, 2500));
            const info = await page.evaluate(`({ href: location.href, title: document.title, body: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 1500) })`);
            const href = info?.href ?? '';
            const title = info?.title ?? '';
            const body = info?.body ?? '';
            // 判据只有一条：**能不能看到只有登录用户才看得到的东西**
            // 实测（2026-11）：拼多多未登录时 personal.html 也会跳 login.html，
            // 所以判据统一为「是否被跳到登录页」，不要看页面里有没有「我的订单」（匿名也有）
            // 「没被跳转」不等于已登录：京东个人中心的外壳谁都能打开，但会显示
            // 「账号信息获取失败，请刷新重试」。所以还要看正文里有没有登录失败的痕迹。
            const shellFail = /账号信息获取失败|请先登录|请登录后|登录后查看|立即登录|登录\/注册/.test(body);
            const kicked = /login\.html|passport\.|plogin|\/login/i.test(href) || shellFail;
            const baseline = await readBaseline(ctx, platform);
            const changed = changedSince(platform, baseline, cookieList);
            // 判定只用**行为**，不看 cookie：
            //   京东/淘宝 → 会员页被踢回登录页 = 未登录
            //   拼多多   → 会员页一律跳 portal（不论登录与否），所以看它自己的登录页：
            //              **仍停在 login 页 = 未登录**，登录成功后会被重定向走
            //
            // 为什么不能用 cookie：自检实测发现拼多多的 PDDAccessToken、淘宝的 cookie2
            // 在匿名会话里就存在，拿它们当证据会把「没登录」误报成「已登录」。
            const loggedIn = !kicked;
            // 证据只用行为：cookie 名在匿名会话里也可能存在，拿来当证据会误判
            const evidence = kicked
                ? (shellFail ? '页面提示需要登录（账号信息加载失败）' : '被跳回登录页')
                : '页面正常显示个人中心内容';
            return {
                loggedIn,
                detail: loggedIn
                    ? `${zh}已登录（${evidence}）`
                    : `${zh}未登录（${evidence}）`,
            };
        }
        catch (error) {
            return { loggedIn: false, detail: `校验失败：${error.message}` };
        }
        finally {
            await page.close().catch(() => undefined);
        }
    };
    const win = (0, browser_1.getLoginWindow)(ctx, platform);
    if (win)
        return check(win.browser);
    // 窗口已关（比如用户先关掉了）：临时用 profile 打开校验一次
    return check(await (0, browser_1.acquireProfile)(ctx, config, platform));
}
/** 用户说「扫完了」：验证 cookie → 记录状态 → 关窗口 */
async function confirmLogin(ctx, config, platform) {
    const zh = PLATFORM_ZH[platform] ?? platform;
    // 扫码确认到 cookie 落地有几秒延迟（拼多多尤其慢），不能验一次就判死刑
    let check = await verifyLogin(ctx, config, platform);
    for (let attempt = 0; attempt < 3 && !check.loggedIn; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        check = await verifyLogin(ctx, config, platform);
    }
    if (!check.loggedIn) {
        await setAuthState(ctx, platform, 'expired');
        // 二维码有效期通常只有 60 秒，扫码失败很可能是码已经轮换了：直接给一张新的
        const fresh = await requestLogin(ctx, config, platform).catch(() => null);
        return {
            ok: false,
            qr: fresh?.qr,
            message: [
                `${zh}没检测到登录态：${check.detail}`,
                '',
                '可能原因：还没扫完 / 扫了但没在手机上点确认 / 窗口被关掉了。',
                '窗口还开着的话可以再扫一次，好了再发「价格 管理 登录 确认」。',
                fresh?.qr ? '下面这张是刚刚重新截的新二维码，直接用这张扫（旧码已失效）。' : '如果二维码失效：发「价格 管理 登录 拼多多」我会重新截一张。',
                '不想登就发「价格 管理 登录 跳过」。',
            ].join('\n'),
        };
    }
    await setAuthState(ctx, platform, 'ok');
    await repo.metaDel(ctx, `authFail:${platform}`);
    await (0, guard_1.unblock)(ctx, platform);
    if (!config.collect.keepLoginWindow)
        await (0, browser_1.closeLoginWindow)(ctx, platform);
    // 关掉窗口后重新读一遍磁盘 profile：这才是「持久化成功」的证据
    const persisted = await inspectPlatform(ctx, config, platform).catch(() => null);
    const proof = persisted
        ? `\n已写入 profile：${persisted.cookieCount} 个 cookie，关键 ${persisted.keyCookies.slice(0, 3).join('/') || '（未识别到，可能没真的登上）'}`
        : '';
    return { ok: true, message: `${zh}登录成功：${check.detail}${proof}` };
}
/** 跳过某平台的登录：关窗口 + 标记为未登录 */
async function skipLogin(ctx, platform) {
    await setAuthState(ctx, platform, 'expired');
    await (0, browser_1.closeLoginWindow)(ctx, platform);
}
// ── 登录态体检 ───────────────────────────────────
/**
 * 各平台「真的登录了」的判定 cookie。
 *
 * 为什么必须逐个平台写死：拼多多的 PDDAccessToken、淘宝的 cookie2 在**未登录时也存在**
 * （匿名设备指纹），拿它们当登录证据就会误报「已登录」，接着采集时平台说「登录查看价格」，
 * 用户看到的就是「明明登录了却没用」。
 */
const DEFINITIVE = {
    jd: [{ name: 'pt_key', minLength: 10 }],
    taobao: [{ name: 'unb', minLength: 3 }],
    pdd: [{ name: 'pdd_user_id', minLength: 3, deny: ['0', ''] }],
};
/** 用「决定性 cookie」判断是否真的登录了 */
function evaluateCookies(platform, cookies) {
    const rules = DEFINITIVE[platform];
    if (!rules?.length) {
        return { loggedIn: cookies.length > 0, evidence: `无判定规则（${cookies.length} 个 cookie）` };
    }
    const found = [];
    for (const rule of rules) {
        const cookie = cookies.find((c) => c.name === rule.name);
        if (!cookie)
            continue;
        if (rule.minLength && cookie.value.length < rule.minLength)
            continue;
        if (rule.deny?.includes(cookie.value))
            continue;
        found.push(rule.name);
    }
    return found.length
        ? { loggedIn: true, evidence: `有 ${found.join('/')}` }
        : { loggedIn: false, evidence: `缺少 ${rules.map((r) => r.name).join('/')}` };
}
/** 读磁盘上的 profile，看关键 cookie 还在不在（这才是「持久化」的证据） */
async function inspectPlatform(ctx, config, platform) {
    const fs = require('node:fs');
    const { profileDirOf } = await Promise.resolve().then(() => __importStar(require('../crawler/browser')));
    const dir = profileDirOf(config, platform);
    const profileExists = fs.existsSync(dir);
    const state = await getAuthState(ctx, platform);
    const at = await repo.metaGet(ctx, `authAt:${platform}`);
    let cookieCount = 0;
    let keyCookies = [];
    let evidence = '';
    let realLoggedIn = null;
    if (profileExists) {
        try {
            const browser = await (0, browser_1.acquireProfile)(ctx, config, platform);
            const cookies = (await browser.cookies?.()) ?? [];
            cookieCount = cookies.length;
            const hint = COOKIE_HINTS[platform];
            keyCookies = cookies.filter((cookie) => hint?.test(cookie.name)).map((cookie) => cookie.name);
            // 以决定性 cookie 为准，meta 里的标记不能当真理
            const check = evaluateCookies(platform, cookies);
            realLoggedIn = check.loggedIn;
            evidence = check.evidence;
        }
        catch { /* 读不到就如实留空 */ }
    }
    // 真实状态覆盖 meta 状态：meta 说 ok 但 cookie 不在，就是过期
    const effective = realLoggedIn === null
        ? state
        : realLoggedIn ? 'ok' : (state === 'ok' ? 'expired' : state);
    return {
        platform,
        zh: PLATFORM_ZH[platform] ?? platform,
        state: effective,
        evidence,
        profileExists,
        profilePath: dir,
        cookieCount,
        keyCookies,
        lastAt: at ? new Date(Number(at)).toLocaleString('zh-CN') : undefined,
    };
}
/** 三个平台一起体检，给「价格 管理 登录 状态」用 */
async function authReport(ctx, config) {
    const platforms = ['pdd', 'jd', 'taobao'];
    const infos = [];
    for (const platform of platforms) {
        const info = await inspectPlatform(ctx, config, platform);
        // 真实状态以行为验证为准：cookie 在匿名会话里也有，用 cookie 推导会误报「已登录」
        if (config.collect.browserEnabled) {
            const live = await verifyLogin(ctx, config, platform).catch(() => null);
            if (live)
                info.state = live.loggedIn ? 'ok' : 'expired';
        }
        infos.push(info);
    }
    const lines = ['登录状态（行为验证：打开会员页/登录页看是否被踢）：'];
    for (const info of infos) {
        const stateText = info.state === 'ok' ? '已登录'
            : info.state === 'pending' ? '登录中（上次流程没走完）'
                : info.state === 'failed' ? '登录页打不开'
                    : '未登录';
        lines.push('');
        lines.push(`${info.state === 'ok' ? '✓' : '·'} ${info.zh}：${stateText}`);
        lines.push(`  参考 cookie：${info.keyCookies.slice(0, 3).join('/') || '无'}（共 ${info.cookieCount} 个）`);
        if (info.lastAt)
            lines.push(`  上次操作：${info.lastAt}`);
    }
    lines.push('');
    lines.push(isLoginWatching(ctx) ? '自动检测：运行中（每 2.5 秒查一次，扫完会自动反馈）' : '自动检测：未运行（发一次「价格 管理 登录」才会开始）');
    const needScan = infos.filter((info) => info.state !== 'ok');
    lines.push('');
    if (needScan.length) {
        lines.push(`需要扫码：${needScan.map((info) => info.zh).join('、')}`);
        lines.push('发「价格 管理 登录」——拼多多 → 京东 → 淘宝 依次给二维码，扫完自动跳下一步，不用发确认。');
        lines.push('只登一个：价格 管理 登录 京东');
    }
    else {
        lines.push('三个平台都已登录，可以直接采集：价格 管理 采集');
    }
    return lines.join('\n');
}
/** 兼容导出：真正的实现在 selfcheck.ts，避免循环依赖 */
async function loginSelfCheck(ctx, config) {
    const mod = await Promise.resolve().then(() => __importStar(require('./selfcheck')));
    return mod.runLoginSelfCheck(ctx, config);
}
const watchTimers = new WeakMap();
let watching = false;
async function deliverTo(ctx, origin, text) {
    if (!origin?.channelId)
        return;
    const bot = ctx.bots.find((b) => b.platform === origin.platform);
    if (!bot)
        return;
    try {
        await bot.sendMessage(origin.channelId, text);
    }
    catch { /* 推送失败不影响登录态 */ }
}
async function beginActiveLogin(ctx, config, platform, origin) {
    await repo.metaSet(ctx, 'login:active', JSON.stringify({ platform, origin, at: Date.now() })).catch(() => undefined);
    startLoginWatch(ctx, config);
}
async function clearActiveLogin(ctx) {
    await repo.metaDel(ctx, 'login:active').catch(() => undefined);
}
/** 启动时恢复：上次没走完的单平台登录，把观察者重新接上 */
async function resumeLoginWatch(ctx, config) {
    const raw = await repo.metaGet(ctx, 'login:active');
    if (!raw)
        return;
    startLoginWatch(ctx, config);
}
function isLoginWatching(ctx) {
    return watchTimers.has(ctx);
}
function stopLoginWatch(ctx) {
    const timer = watchTimers.get(ctx);
    if (!timer)
        return;
    clearInterval(timer);
    watchTimers.delete(ctx);
}
function startLoginWatch(ctx, config) {
    if (watchTimers.has(ctx))
        return;
    const timer = setInterval(async () => {
        if (watching)
            return;
        watching = true;
        try {
            const raw = await repo.metaGet(ctx, 'login:active');
            if (!raw) {
                stopLoginWatch(ctx);
                return;
            }
            const active = JSON.parse(raw);
            const platform = active.platform ?? '';
            if (!platform)
                return;
            // 向导在跑的时候由向导自己推进，避免两边同时改状态
            const wizard = await Promise.resolve().then(() => __importStar(require('./wizard')));
            if (await wizard.getWizard(ctx))
                return;
            // 二维码约 60 秒过期：45 秒换一张推给用户，避免扫到失效的码
            const page = loginPages.get(ctx)?.get(platform);
            let stamps = lastQrAt.get(ctx);
            if (!stamps) {
                stamps = new Map();
                lastQrAt.set(ctx, stamps);
            }
            if (page && Date.now() - (stamps.get(platform) ?? 0) > QR_REFRESH_MS) {
                try {
                    const shot = await page.screenshot?.({ type: 'png' });
                    if (shot) {
                        stamps.set(platform, Date.now());
                        const bot = ctx.bots.find((b) => b.platform === active.origin?.platform);
                        if (bot && active.origin?.channelId) {
                            const { h } = await Promise.resolve().then(() => __importStar(require('koishi')));
                            await bot.sendMessage(active.origin.channelId, '二维码已刷新（旧码失效），请扫这一张：');
                            await bot.sendMessage(active.origin.channelId, h.image(shot, 'image/png').toString());
                        }
                    }
                }
                catch { /* 刷新失败继续用旧图 */ }
            }
            const check = await quickCheckLogin(ctx, config, platform, (await readBaseline(ctx, platform)) ?? undefined);
            if (!check.loggedIn)
                return;
            await setAuthState(ctx, platform, 'ok');
            if (!config.collect.keepLoginWindow)
                await (0, browser_1.closeLoginWindow)(ctx, platform);
            await repo.metaDel(ctx, 'login:active').catch(() => undefined);
            await repo.metaDel(ctx, `authFail:${platform}`).catch(() => undefined);
            stopLoginWatch(ctx);
            await deliverTo(ctx, active.origin, `✅ ${PLATFORM_ZH[platform] ?? platform} 登录成功（${check.reason}）\n登录态已写入 profile，接下来可以直接采集。`);
        }
        catch { /* 单次轮询失败继续 */ }
        finally {
            watching = false;
        }
    }, 2500);
    timer.unref?.();
    watchTimers.set(ctx, timer);
    ctx.effect(() => () => {
        stopLoginWatch(ctx);
        return () => undefined;
    });
}
//# sourceMappingURL=login.js.map