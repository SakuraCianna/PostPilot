import { describe, expect, it } from 'vitest';
import {
  createReadinessSteps,
  getPublishEventState,
} from './productStatus';
import type { PlatformDraft, PublishEvent } from '../shared/types';

const draft: PlatformDraft = {
  platformId: 'wechat',
  title: '标题',
  summary: '摘要',
  body: '<p>正文</p>',
  hashtags: [],
  status: 'needs-review',
};

describe('product status helpers', () => {
  it('creates blocked readiness steps when review is pending', () => {
    const steps = createReadinessSteps({
      draft,
      publishEvents: [],
    });

    expect(steps.map((step) => [step.label, step.state, step.text])).toEqual([
      ['草稿', 'done', '已生成'],
      ['审查', 'blocked', '待审查'],
      ['发布', 'done', '模拟模式'],
      ['结果', 'idle', '暂无结果'],
    ]);
  });

  it('shows latest failed publish event as failed result state', () => {
    const state = getPublishEventState([
      {
        id: 'event-1',
        sessionId: 'session-1',
        platformId: 'wechat',
        mode: 'simulated',
        status: 'failed',
        message: '发布失败',
        createdAt: '2026-05-29T04:00:00.000Z',
      },
    ] satisfies PublishEvent[]);

    expect(state).toEqual({
      state: 'failed',
      text: '发布失败',
    });
  });

  it('adds a blocked content review readiness step', () => {
    const steps = createReadinessSteps({
      draft,
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
      publishEvents: [],
    });

    expect(steps).toContainEqual(
      expect.objectContaining({
        id: 'content',
        state: 'failed',
      }),
    );
  });
});
