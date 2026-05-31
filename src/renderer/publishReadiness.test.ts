import { describe, expect, it } from 'vitest';
import { PLATFORM_ADAPTERS } from '../shared/platformAdapters';
import type {
  ContentReviewResult,
  PlatformAccountConfig,
  PlatformDraft,
  SavedSession,
} from '../shared/types';
import { createPublishReadiness } from './publishReadiness';

const drafts: PlatformDraft[] = PLATFORM_ADAPTERS.map((adapter) => ({
  platformId: adapter.id,
  title: `${adapter.displayName} 标题`,
  summary: '摘要',
  body: '正文',
  hashtags: [],
  status: 'ready',
}));

const passedReview: ContentReviewResult = {
  status: 'passed',
  model: 'deepseek-v4-flash',
  modelStatus: 'local-fallback',
  message: '未发现明显风险',
  reviewedAt: '2026-05-29T08:00:00.000Z',
  issues: [],
};

const session: SavedSession = {
  id: 'session-1',
  title: '发布测试',
  sourceBody: '正文',
  drafts,
  model: 'deepseek-v4-flash',
  modelStatus: 'local-fallback',
  modelMessage: '本地生成',
  createdAt: '2026-05-29T07:00:00.000Z',
  updatedAt: '2026-05-29T08:00:00.000Z',
  publishEvents: [],
  contentReview: passedReview,
};

const authorizedAccounts: PlatformAccountConfig[] = PLATFORM_ADAPTERS.map((adapter) => ({
  platformId: adapter.id,
  displayName: adapter.displayName,
  builtIn: true,
  enabled: true,
  configured: true,
  status: 'authorized',
  statusMessage: '模拟发布模式',
  maskedFields: {},
}));

describe('publish readiness', () => {
  it('blocks publish all when review is missing', () => {
    const readiness = createPublishReadiness({
      session: {
        ...session,
        contentReview: undefined,
      },
      adapters: PLATFORM_ADAPTERS,
      accounts: authorizedAccounts,
    });

    expect(readiness.canRunPublishAll).toBe(false);
    expect(readiness.items).toContainEqual(
      expect.objectContaining({
        id: 'content-review',
        state: 'blocked',
        action: '先运行 AI 审查',
      }),
    );
  });

  it('allows simulated publishing across all configured platforms', () => {
    const readiness = createPublishReadiness({
      session,
      adapters: PLATFORM_ADAPTERS,
      accounts: authorizedAccounts,
    });

    expect(readiness.canRunPublishAll).toBe(true);
    expect(readiness.publishablePlatformIds).toEqual(PLATFORM_ADAPTERS.map((adapter) => adapter.id));
    expect(readiness.items).toContainEqual(
      expect.objectContaining({
        id: 'platform-coverage',
        state: 'done',
        detail: '所有平台支持模拟发布',
      }),
    );
  });

  it('does not require account authorization for simulated publishing', () => {
    const readiness = createPublishReadiness({
      session,
      adapters: PLATFORM_ADAPTERS,
      accounts: authorizedAccounts.map((account) =>
        account.platformId === 'wechat'
          ? { ...account, status: 'configured', statusMessage: '待确认' }
          : account,
      ),
    });

    expect(readiness.canRunPublishAll).toBe(true);
    expect(readiness.items).toContainEqual(
      expect.objectContaining({
        id: 'simulation-mode',
        state: 'done',
        detail: '已切换为全模拟发布',
      }),
    );
  });
});
