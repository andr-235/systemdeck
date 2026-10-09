import type { CleanupProgressEvent } from '@shared/ipc/contracts';

type RunningEvent = Extract<CleanupProgressEvent, { status: 'running' }>;
type TerminalEvent = Extract<
  CleanupProgressEvent,
  { status: 'completed' | 'cancelled' | 'failed' }
>;

export type ProgressEmitterDeps = {
  send: (event: CleanupProgressEvent) => void;
  throttleMs?: number;
  now?: () => number;
};

/** Throttle только running-событий; терминальное событие отправляется всегда (REQ-006). */
export class CleanupProgressEmitter {
  static readonly DEFAULT_THROTTLE_MS = 100;

  private readonly send: (event: CleanupProgressEvent) => void;
  private readonly throttleMs: number;
  private readonly now: () => number;
  private lastRunningAt = Number.NEGATIVE_INFINITY;

  constructor(deps: ProgressEmitterDeps) {
    this.send = deps.send;
    this.throttleMs = deps.throttleMs ?? CleanupProgressEmitter.DEFAULT_THROTTLE_MS;
    this.now = deps.now ?? Date.now;
  }

  emitRunning(payload: Omit<RunningEvent, 'status' | 'timestamp'>): void {
    const now = this.now();
    if (now - this.lastRunningAt < this.throttleMs) {
      return;
    }
    this.lastRunningAt = now;
    this.send({ ...payload, status: 'running', timestamp: now });
  }

  emitTerminal(payload: Omit<TerminalEvent, 'timestamp'>): void {
    this.send({ ...payload, timestamp: this.now() });
  }
}
