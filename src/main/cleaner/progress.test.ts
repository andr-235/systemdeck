import { describe, expect, it } from 'vitest';
import type { CleanupProgressEvent } from '@shared/ipc/contracts';
import { CleanupProgressEmitter } from './progress';

type Running = Extract<CleanupProgressEvent, { status: 'running' }>;

function runningPayload(operationId: string): Omit<Running, 'status' | 'timestamp'> {
  return {
    operationId,
    sessionId: 's1',
    phase: 'deleting',
    processed: 1,
    total: 2,
    freedBytes: 10,
  };
}

describe('cleanup progress emitter', () => {
  it('throttles running events but keeps the first one', () => {
    let nowMs = 1_000;
    const events: CleanupProgressEvent[] = [];
    const emitter = new CleanupProgressEmitter({
      send: (event) => events.push(event),
      now: () => nowMs,
      throttleMs: 100,
    });
    emitter.emitRunning(runningPayload('op-1'));
    nowMs += 50;
    emitter.emitRunning(runningPayload('op-1'));
    nowMs += 100;
    emitter.emitRunning(runningPayload('op-1'));
    expect(events.filter((event) => event.status === 'running')).toHaveLength(2);
  });

  it('always sends the terminal event even inside the throttle window', () => {
    let nowMs = 1_000;
    const events: CleanupProgressEvent[] = [];
    const emitter = new CleanupProgressEmitter({
      send: (event) => events.push(event),
      now: () => nowMs,
      throttleMs: 10_000,
    });
    emitter.emitRunning(runningPayload('op-1'));
    nowMs += 1;
    emitter.emitRunning(runningPayload('op-1'));
    emitter.emitTerminal({
      operationId: 'op-1',
      sessionId: 's1',
      status: 'completed',
      report: { items: [], total: 0, deleted: 0, skipped: 0, failed: 0, freedBytes: 0 },
    });
    expect(events.at(-1)).toMatchObject({ status: 'completed', operationId: 'op-1' });
    expect(events).toHaveLength(2);
  });
});
