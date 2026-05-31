import { describe, expect, it } from 'vitest';
import { createPublishTask } from './publishers';
import { createCustomPlatformAdapter } from '../../shared/platformAdapters';
import type { PlatformDraft, SecretPlatformAccountConfig } from '../../shared/types';

const draft: PlatformDraft = {
  platformId: 'wechat',
  title: '发布测试',
  summary: '摘要',
  body: '<p>正文</p>',
  hashtags: [],
  status: 'ready',
};

describe('publishers', () => {
  it('allows publishing generated drafts without manual review gate', async () => {
    const task = await createPublishTask({
      draft: {
        ...draft,
        status: 'needs-review',
      },
      mode: 'simulated',
    });

    expect(task.status).toBe('success');
    expect(task.event.status).toBe('success');
    expect(task.event.message).toBe('微信公众号 模拟发布已完成');
  });

  it('blocks publishing when content review has legal risks', async () => {
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

  it('creates a simulated publish task with Chinese message', async () => {
    const task = await createPublishTask({
      draft,
      mode: 'simulated',
    });

    expect(task.status).toBe('success');
    expect(task.event.status).toBe('success');
    expect(task.event.mode).toBe('simulated');
    expect(task.event.message).toBe('微信公众号 模拟发布已完成');
    expect(task.artifact).toBeUndefined();
  });

  it('creates an export task with draft content artifact', async () => {
    const task = await createPublishTask({
      draft,
      mode: 'exportOnly',
    });

    expect(task.status).toBe('success');
    expect(task.event.mode).toBe('exportOnly');
    expect(task.event.message).toBe('微信公众号 导出内容已生成');
    expect(task.artifact?.filename).toMatch(/^wechat-/);
    expect(task.artifact?.content).toContain('<p>正文</p>');
  });

  it('exports plain text platforms as txt artifacts', async () => {
    const task = await createPublishTask({
      draft: {
        ...draft,
        platformId: 'bilibili',
        body: '视频简介',
        hashtags: ['效率工具'],
      },
      mode: 'exportOnly',
    });

    expect(task.artifact?.filename).toMatch(/^bilibili-.*\.txt$/);
    expect(task.artifact?.mimeType).toBe('text/plain;charset=utf-8');
    expect(task.artifact?.content).toContain('视频简介');
  });

  it('creates a browser assist package with autofill script', async () => {
    const task = await createPublishTask({
      draft: {
        ...draft,
        platformId: 'zhihu',
        body: '# 标题\n\n正文内容',
        hashtags: ['效率工具', '内容创作'],
      },
      mode: 'browserAssist',
    });

    expect(task.status).toBe('pending');
    expect(task.event.status).toBe('pending');
    expect(task.event.message).toContain('浏览器辅助填充包');
    expect(task.artifact?.filename).toMatch(/^zhihu-browser-assist-.*\.html$/);
    expect(task.artifact?.mimeType).toBe('text/html;charset=utf-8');
    expect(task.artifact?.content).toContain('自动填充脚本');
    expect(task.artifact?.content).toContain('发布测试');
    expect(task.artifact?.content).toContain('正文内容');
    expect(task.artifact?.content).toContain('https://www.zhihu.com');
  });

  it('creates a browser assist package for custom platforms with configured target url', async () => {
    const customDraft: PlatformDraft = {
      ...draft,
      platformId: 'douyin',
      title: '抖音标题',
      body: '抖音正文',
      hashtags: ['创作者工具'],
    };
    const account: SecretPlatformAccountConfig = {
      platformId: 'douyin',
      enabled: true,
      fields: {
        publishUrl: 'https://creator.douyin.com/',
      },
    };

    const task = await createPublishTask(
      {
        draft: customDraft,
        mode: 'browserAssist',
      },
      {
        adapters: [createCustomPlatformAdapter('douyin', '抖音')],
        getAccountConfig: () => account,
      },
    );

    expect(task.status).toBe('pending');
    expect(task.event.message).toContain('抖音 浏览器辅助填充包');
    expect(task.artifact?.filename).toMatch(/^douyin-browser-assist-.*\.html$/);
    expect(task.artifact?.content).toContain('https://creator.douyin.com/');
    expect(task.artifact?.content).toContain('抖音正文');
  });

  it('runs official connector with saved account config and receipt', async () => {
    const account: SecretPlatformAccountConfig = {
      platformId: 'wechat',
      enabled: true,
      fields: {
        appId: 'wx123',
        appSecret: 'secret',
        thumbMediaId: 'thumb-media',
        publishTarget: 'draft',
      },
    };
    const task = await createPublishTask(
      {
        draft,
        mode: 'officialApi',
      },
      {
        getAccountConfig: () => account,
        fetchImpl: async (url, init) => {
          if (String(url).includes('/cgi-bin/token')) {
            return new Response(JSON.stringify({ access_token: 'token' }));
          }
          expect(String(init?.body)).toContain('thumb-media');
          return new Response(JSON.stringify({ media_id: 'draft-media-id' }));
        },
      },
    );

    expect(task.status).toBe('success');
    expect(task.event.status).toBe('success');
    expect(task.event.receipt?.draftId).toBe('draft-media-id');
  });

  it('returns a failed official API task when account config is missing', async () => {
    const task = await createPublishTask({
      draft,
      mode: 'officialApi',
    });

    expect(task.status).toBe('failed');
    expect(task.event.status).toBe('failed');
    expect(task.event.message).toBe('请先在设置中完成微信公众号账号配置');
  });
});
