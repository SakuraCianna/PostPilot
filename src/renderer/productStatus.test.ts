import { describe, expect, it } from 'vitest';
import {
  createReadinessSteps,
  getAccountDisplayState,
  getPublishEventState,
} from './productStatus';
import type { PlatformAccountConfig, PlatformDraft, PublishEvent } from '../shared/types';

const draft: PlatformDraft = {
  platformId: 'wechat',
  title: '标题',
  summary: '摘要',
  body: '<p>正文</p>',
  hashtags: [],
  status: 'needs-review',
};

const account: PlatformAccountConfig = {
  platformId: 'wechat',
  enabled: true,
  configured: true,
  status: 'authorized',
  statusMessage: '授权校验通过',
  maskedFields: {},
};

describe('product status helpers', () => {
  it('creates blocked readiness steps when review is pending', () => {
    const steps = createReadinessSteps({
      draft,
      account,
      publishEvents: [],
    });

    expect(steps.map((step) => [step.label, step.state, step.text])).toEqual([
      ['审核', 'blocked', '待审核'],
      ['审查', 'blocked', '待审查'],
      ['账号', 'done', '已授权'],
      ['回执', 'idle', '暂无回执'],
    ]);
  });

  it('marks account as blocked when config is missing', () => {
    const state = getAccountDisplayState({
      platformId: 'wechat',
      enabled: false,
      configured: false,
      status: 'not-configured',
      statusMessage: '未配置账号',
      maskedFields: {},
    });

    expect(state).toEqual({
      state: 'blocked',
      text: '未配置',
    });
  });

  it('shows latest failed publish event as failed receipt state', () => {
    const state = getPublishEventState([
      {
        id: 'event-1',
        sessionId: 'session-1',
        platformId: 'wechat',
        mode: 'officialApi',
        status: 'failed',
        message: '请先完成手动审核',
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
      account,
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
