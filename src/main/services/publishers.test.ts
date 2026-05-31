import { describe, expect, it } from 'vitest';
import { createPublishTask } from './publishers';
import { createCustomPlatformAdapter } from '../../shared/platformAdapters';
import type { PlatformDraft } from '../../shared/types';

const draft: PlatformDraft = {
  platformId: 'wechat',
  title: '发布测试',
  summary: '摘要',
  body: '<p>正文</p>',
  hashtags: [],
  status: 'ready',
};

describe('publishers', () => {
  it('creates a simulated publish task with Chinese message', async () => {
    const task = await createPublishTask({
      draft,
      mode: 'simulated',
    });

    expect(task.status).toBe('success');
    expect(task.event.status).toBe('success');
    expect(task.event.mode).toBe('simulated');
    expect(task.event.message).toBe('微信公众号 模拟发布已完成');
  });

  it('allows simulated publishing generated drafts without manual review gate', async () => {
    const task = await createPublishTask({
      draft: {
        ...draft,
        status: 'needs-review',
      },
      mode: 'simulated',
    });

    expect(task.status).toBe('success');
    expect(task.event.message).toBe('微信公众号 模拟发布已完成');
  });

  it('blocks simulated publishing when content review has legal risks', async () => {
    const task = await createPublishTask({
      draft,
      mode: 'simulated',
      contentReview: {
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
            suggestion: 'Use neutral wording.',
            confidence: 'high',
          },
        ],
      },
    });

    expect(task.status).toBe('failed');
    expect(task.event.status).toBe('failed');
    expect(task.event.message).toContain('内容法律风险');
  });

  it('simulates custom platform publishing through dynamic adapters', async () => {
    const task = await createPublishTask(
      {
        draft: {
          ...draft,
          platformId: 'threads',
          title: 'Threads 标题',
          body: 'Threads 正文',
        },
        mode: 'simulated',
      },
      {
        adapters: [createCustomPlatformAdapter('threads', 'Threads')],
      },
    );

    expect(task.status).toBe('success');
    expect(task.event.message).toBe('Threads 模拟发布已完成');
  });
});
