import { type DB } from "./db.js";
import { type Config } from "./config.js";
import { type MessageQueue } from "./message-queue.js";
import { type HookRegistry } from "./hooks.js";
import { type RateTracker } from "./rate-tracker.js";

export interface AppState {
  readonly db: DB;
  readonly config: Config;
  readonly queue: MessageQueue;
  readonly hooks: HookRegistry;
  readonly rateTracker: RateTracker;
  readonly startedAt: Date;
}

let _state: AppState | null = null;

export function initState(state: AppState): void {
  if (_state !== null) throw new Error("AppState already initialized");
  _state = state;
}

export function getState(): AppState {
  if (_state === null) throw new Error("AppState not yet initialized");
  return _state;
}

export function isStateInitialized(): boolean {
  return _state !== null;
}
