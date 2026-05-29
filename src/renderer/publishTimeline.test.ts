import { describe, expect, it } from 'vitest';
import { PLATFORM_ADAPTERS } from '../shared/platformAdapters';
import type { PlatformDraft, PublishEvent, SavedSession } from '../shared/types';
import { createPublishTimeline } from './publishTimeline';

const drafts: PlatformDraft[] = PLATFORM_ADAPTERS.map((adapter) => ({
  platformId: adapter.id,
  title: `${adapter.displayName} 标题`,
  summary: '摘要',
  body: '正文',
  hashtags: [],
  status: 'ready',
}));

const session: SavedSession = {
  id: 'session-1',
  title: '内容发布',
  sourceBody: '正文',
  drafts,
  model: 'deepseek-v4-flash',
  modelStatus: 'local-fallback',
  modelMessage: '本地生成',
  createdAt: '2026-05-29T03:00:00.000Z',
  updatedAt: '2026-05-29T04:00:00.000Z',
  publishEvents: [],
};

describe('publish timeline helpers', () => {
  it('uses the latest event for retryable failed platform tasks', () => {
    const publishEvents: PublishEvent[] = [
      {
        id: 'event-old',
        sessionId: 'session-1',
        platformId: 'wechat',
        mode: 'officialApi',
        status: 'success',
        message: '旧回执',
        attempts: 1,
        createdAt: '2026-05-29T03:10:00.000Z',
      },
      {
        id: 'event-new',
        sessionId: 'session-1',
        platformId: 'wechat',
        mode: 'officialApi',
        status: 'failed',
        message: '账号授权失败',
        attempts: 2,
        createdAt: '2026-05-29T03:20:00.000Z',
      },
    ];

    const timeline = createPublishTimeline({
      session: {
        ...session,
        publishEvents,
      },
      adapters: PLATFORM_ADAPTERS,
    });

    expect(timeline.items[0]).toMatchObject({
      platformId: 'wechat',
      status: 'failed',
      canRetry: true,
      attempts: 2,
      message: '账号授权失败',
    });
    expect(timeline.summary.failed).toBe(1);
  });

  it('treats generated drafts as ready without manual review', () => {
    const timeline = createPublishTimeline({
      session: {
        ...session,
        drafts: drafts.map((draft) =>
          draft.platformId === 'zhihu' ? { ...draft, status: 'needs-review' } : draft,
        ),
      },
      adapters: PLATFORM_ADAPTERS,
    });

    const zhihu = timeline.items.find((item) => item.platformId === 'zhihu');

    expect(zhihu).toMatchObject({
      status: 'ready',
      canRetry: false,
      message: '等待发布任务',
    });
    expect(timeline.summary.ready).toBe(4);
  });

  it('summarizes success progress across all platforms', () => {
    const timeline = createPublishTimeline({
      session: {
        ...session,
        publishEvents: PLATFORM_ADAPTERS.slice(0, 2).map((adapter, index) => ({
          id: `event-${adapter.id}`,
          sessionId: 'session-1',
          platformId: adapter.id,
          mode: 'simulated',
          status: 'success',
          message: '模拟发布完成',
          createdAt: `2026-05-29T03:${10 + index}:00.000Z`,
        })),
      },
      adapters: PLATFORM_ADAPTERS,
    });

    expect(timeline.summary.success).toBe(2);
    expect(timeline.summary.total).toBe(4);
    expect(timeline.summary.progress).toBe(50);
  });
});
