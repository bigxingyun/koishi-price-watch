"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plannedAt = plannedAt;
exports.mountScheduler = mountScheduler;
const constants_1 = require("../constants");
const collect_1 = require("./collect");
const repo_1 = require("../store/repo");
const digest_1 = require("../notify/digest");
const alert_1 = require("../notify/alert");
/** 当天的计划触发时刻（含按天稳定的抖动，避免每天同一秒打请求） */
function plannedAt(day, hhmm, jitterSeconds) {
    const [hour, minute] = hhmm.split(':').map((v) => Number.parseInt(v, 10));
    const base = (0, constants_1.fromDay)(day);
    base.setHours(Number.isFinite(hour) ? hour : 3, Number.isFinite(minute) ? minute : 0, 0, 0);
    const offset = jitterSeconds > 0 ? hash(`${day}:${hhmm}`) % jitterSeconds : 0;
    return new Date(base.getTime() + offset * 1000);
}
function hash(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
/** 计划时间过了多久还算「来得及跑」（超过这个窗口说明进程当时不在，就别补了） */
const WINDOW_MS = 45 * 60 * 1000;
function mountScheduler(ctx, config) {
    const logger = ctx.logger('price-watch');
    let running = false;
    const plans = [
        {
            name: 'full',
            time: config.collect.fullTime,
            run: async (c, cfg) => {
                const result = await (0, collect_1.runCollect)(c, cfg, {});
                logger.info('全量采集：%d 成功 / %d 失败', result.ok, result.failed);
            },
        },
        {
            name: 'patch',
            time: config.collect.patchTime,
            run: async (c, cfg) => {
                if (!cfg.collect.patchEnabled)
                    return;
                const result = await (0, collect_1.runCollect)(c, cfg, { onlyMissing: true });
                logger.info('补采：%d 成功 / %d 失败', result.ok, result.failed);
            },
        },
    ];
    const push = (label, report) => async (c, cfg) => {
        const outcomes = await (0, digest_1.pushDigest)(c, cfg, { report });
        const ok = outcomes.filter((o) => o.ok).length;
        logger.info('%s已推送：%d / %d 个目标成功', label, ok, outcomes.length);
    };
    if (config.push.dailyEnabled) {
        plans.push({ name: 'digest', time: config.push.dailyTime, run: push('日报', 'daily') });
    }
    if (config.push.weeklyEnabled) {
        plans.push({
            name: 'weekly',
            time: config.push.weeklyTime,
            // JS 的 getDay()：0=周日 … 6=周六；配置里 1=周一 … 7=周日
            when: (now) => now.getDay() === config.push.weeklyWeekday % 7,
            run: push('周报', 'weekly'),
        });
    }
    if (config.push.monthlyEnabled) {
        plans.push({
            name: 'monthly',
            time: config.push.monthlyTime,
            when: (now) => now.getDate() === 1,
            run: push('月报', 'monthly'),
        });
    }
    let lastAlertCheck = 0;
    async function tick() {
        if (running)
            return;
        const now = new Date();
        const day = (0, constants_1.toDay)(now);
        // 告警是事件驱动的：每小时看一次，8:00~23:00 之外不打扰
        if (config.alert.enabled
            && now.getHours() >= 8 && now.getHours() <= 23
            && now.getTime() - lastAlertCheck > 3600_000) {
            lastAlertCheck = now.getTime();
            void (0, alert_1.pushAlerts)(ctx, config).then((r) => {
                if (r.sent)
                    logger.info('告警已发送 %d 条', r.sent);
            }).catch((error) => logger.warn('告警检查失败：%s', error.message));
        }
        for (const plan of plans) {
            if (plan.when && !plan.when(now))
                continue;
            const planned = plannedAt(day, plan.time, config.collect.jitterSeconds);
            if (now < planned)
                continue;
            if (now.getTime() - planned.getTime() > WINDOW_MS)
                continue;
            const key = `lastRun:${plan.name}`;
            const last = await (0, repo_1.metaGet)(ctx, key);
            if (last === String(day))
                continue;
            running = true;
            try {
                await plan.run(ctx, config);
                await (0, repo_1.metaSet)(ctx, key, String(day));
            }
            catch (error) {
                logger.error('%s 任务失败：%s', plan.name, error.message);
            }
            finally {
                running = false;
            }
            return;
        }
    }
    ctx.setInterval(() => { void tick(); }, 60_000);
    logger.info('调度器已启动：全量 %s / 补采 %s / 日报 %s / 周报 %s(周%s) / 月报 %s(1号)（抖动 ≤%d 秒）', config.collect.fullTime, config.collect.patchTime, config.push.dailyTime, config.push.weeklyTime, config.push.weeklyWeekday, config.push.monthlyTime, config.collect.jitterSeconds);
    // 页面关闭前不做持久化（见设计文档：dispose 不保证执行），状态都实时落库
}
//# sourceMappingURL=scheduler.js.map