import type { Command, Context } from 'koishi';
/**
 * 同一个指令注册「英文名 + 中文名」两份。
 *
 * 为什么不用 .alias()：Koishi 的别名只在**单层内**生效（`price daily` 与 `price day` 同级），
 * 它不会把「价格」和「日报」拼起来解析。所以想让 `价格 日报` 能用，
 * 必须在 `price` 下真的注册一个叫 `日报` 的子指令。
 *
 * 代价是多注册几个指令节点；好处是根指令始终只有一个 `price`，全局指令空间干净。
 */
export type CommandSetup = (cmd: Command) => void;
export declare function both(ctx: Context, names: [en: string, zh: string], desc: string, setup: CommandSetup): void;
