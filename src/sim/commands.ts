import type { RoadTypeId } from '../data/roads';
import type { ZoneLetter } from '../data/zones';
import type { Vec2 } from './geom';
import type { Dept } from '../data/economy';

export type ZoneArea = { kind: 'brush'; points: Vec2[]; radius: number } | { kind: 'segment'; id: number };
export type BulldozeTarget = { kind: 'segment'; id: number } | { kind: 'building'; id: number };

/** Every player (and test, debug, replay) action is one of these. DESIGN.md §1.4. */
export type Command =
  | { type: 'cheat'; cheat: 'addMoney'; amount: number }
  | { type: 'renameCity'; name: string }
  /** points = [a, c, b, c, b, ...] (anchors and quadratic control points) or [a, b] for a straight road. */
  | { type: 'buildRoad'; road: RoadTypeId; points: Vec2[] }
  | { type: 'bulldoze'; target: BulldozeTarget }
  /** `stroke` groups several paint commands from one drag into a single undo step. */
  | { type: 'zone'; zone: ZoneLetter | 'none'; area: ZoneArea; stroke?: number }
  | { type: 'undo' }
  | { type: 'setTax'; zone: 'R' | 'C' | 'I'; wealth: 0 | 1 | 2 | 'all'; rate: number }
  | { type: 'setFunding'; dept: Dept; pct: number }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; id: number };

export type CommandType = Command['type'];

export interface CommandOk {
  ok: true;
  cost: number;
  /** Ids of anything created, for undo and for callers that need them. */
  created?: number[];
  info?: Record<string, unknown>;
}
export interface CommandErr {
  ok: false;
  reason: string;
  at?: Vec2;
  info?: Record<string, unknown>;
}
export type CommandResult = CommandOk | CommandErr;

export interface CommandLogEntry {
  tick: number;
  cmd: Command;
}

export const ok = (cost = 0, extra: Partial<CommandOk> = {}): CommandOk => ({ ok: true, cost, ...extra });
export const fail = (reason: string, extra: Partial<CommandErr> = {}): CommandErr => ({
  ok: false,
  reason,
  ...extra,
});
