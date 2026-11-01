import { Context } from 'koishi';
import type { Config } from '../index';
/**
 * 中文指令层。
 *
 * 设计动机：`price admin gc --dryRun` 这种写法对普通用户不友好。
 * 这里给每个常用动作一个「正常人说得出」的名字，英文指令树保持不变（脚本与老用户不受影响），
 * 两者共用同一套业务处理函数，不存在两套逻辑。
 */
export declare function mountHumanCommands(ctx: Context, config: Config, isReady: () => boolean): void;
