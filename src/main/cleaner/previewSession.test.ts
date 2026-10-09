import { describe, expect, it } from 'vitest';
import { CLEANUP_SESSION_TTL_MS, PreviewSessionStore } from './previewSession';
import type { CleanupCandidateDraft } from './preview';

function draft(path: string, sizeBytes = 1): CleanupCandidateDraft {
  return { path, sizeBytes, category: 'user-temp' };
}

function seededIds(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

describe('preview session store', () => {
  it('creates session with unique candidate ids and estimated byte sum', () => {
    const store = new PreviewSessionStore({ now: () => 0, randomId: seededIds() });
    const created = store.create([draft('C:\\a.tmp', 10), draft('C:\\b.tmp', 20)], []);
    expect(created.sessionId).toBe('id-0');
    expect(created.candidates.map((c) => c.id)).toEqual(['id-0:id-1', 'id-0:id-2']);
    expect(created.estimatedBytes).toBe(30);
    expect(created.expiresAt).toBe(CLEANUP_SESSION_TTL_MS);
    expect(store.getActive(created.sessionId)).not.toBeNull();
  });

  it('rejects foreign session ids and invalidates the previous session', () => {
    const store = new PreviewSessionStore({ randomId: seededIds() });
    const first = store.create([draft('C:\\a.tmp')], []);
    const second = store.create([draft('C:\\b.tmp')], []);
    expect(store.getActive(first.sessionId)).toBeNull();
    expect(store.getActive('nope')).toBeNull();
    expect(store.getActive(second.sessionId)).not.toBeNull();
    // ID кандидатов прошлой сессии не находятся в новой (чужой ID).
    expect(store.resolve(store.getActive(second.sessionId)!, first.candidates[0].id)).toBeNull();
  });

  it('expires the session after the ttl', () => {
    let nowMs = 1_000;
    const store = new PreviewSessionStore({ now: () => nowMs, randomId: seededIds() });
    const created = store.create([draft('C:\\a.tmp')], []);
    nowMs += CLEANUP_SESSION_TTL_MS - 1;
    expect(store.getActive(created.sessionId)).not.toBeNull();
    nowMs += 1;
    expect(store.getActive(created.sessionId)).toBeNull();
  });

  it('passes source statuses through to the preview response', () => {
    const store = new PreviewSessionStore({ randomId: seededIds() });
    const sources = [
      {
        category: 'user-temp' as const,
        status: 'partial' as const,
        candidateCount: 1,
        estimatedBytes: 5,
        inaccessibleDirectories: 2,
      },
    ];
    expect(store.create([], sources).sources).toEqual(sources);
  });
});
