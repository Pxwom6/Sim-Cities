/** Every player (and test, debug, replay) action is one of these. DESIGN.md §1.4. */
export type Command =
  { type: 'cheat'; cheat: 'addMoney'; amount: number } | { type: 'renameCity'; name: string };

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
}
export type CommandResult = CommandOk | CommandErr;

export interface CommandLogEntry {
  tick: number;
  cmd: Command;
}

export const ok = (cost = 0, extra: Partial<CommandOk> = {}): CommandOk => ({ ok: true, cost, ...extra });
export const fail = (reason: string): CommandErr => ({ ok: false, reason });
