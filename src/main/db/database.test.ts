import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from './database';
import { createSessionRepository } from './sessionRepository';

describe('session repository', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists sessions with drafts and publish events', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-'));
    tempDirs.push(dir);

    const db = createDatabase(path.join(dir, 'postpilot.sqlite'));
    const repo = createSessionRepository(db);

    const saved = repo.saveSession({
      title: 'Launch note',
      sourceBody: 'One source article.',
      drafts: [
        {
          platformId: 'wechat',
          title: 'Launch note',
          summary: 'Summary',
          body: '<p>One source article.</p>',
          hashtags: [],
          status: 'ready',
        },
      ],
      model: 'deepseek-v4-flash',
      modelStatus: 'local-fallback',
      modelMessage: 'No API key configured.',
    });

    repo.recordPublishEvent({
      sessionId: saved.id,
      platformId: 'wechat',
      mode: 'simulated',
      status: 'success',
      message: 'Simulated publish complete.',
    });

    repo.saveContentReview(saved.id, {
      status: 'blocked',
      model: 'deepseek-v4-flash',
      modelStatus: 'local-fallback',
      message: 'Local review blocked risky content.',
      reviewedAt: '2026-05-29T04:00:00.000Z',
      issues: [
        {
          id: 'risk-1',
          kind: 'legal',
          platformId: 'wechat',
          snippet: 'guaranteed profit',
          reason: 'Absolute financial promise.',
          suggestion: 'Use a neutral risk disclosure.',
          confidence: 'high',
        },
      ],
    });

    const sessions = repo.listSessions();
    const loaded = repo.getSession(saved.id);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.title).toBe('Launch note');
    expect(loaded?.drafts[0]?.platformId).toBe('wechat');
    expect(loaded?.publishEvents[0]?.mode).toBe('simulated');
    expect(loaded?.contentReview?.status).toBe('blocked');
    expect(loaded?.contentReview?.issues[0]?.kind).toBe('legal');

    db.close();
  });
});
