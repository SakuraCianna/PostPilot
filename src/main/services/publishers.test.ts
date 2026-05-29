import { describe, expect, it } from 'vitest';
import { createPublishTask } from './publishers';
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
  it('blocks publishing before manual review is approved', async () => {
    const task = await createPublishTask({
      draft: {
        ...draft,
        status: 'needs-review',
      },
      mode: 'officialApi',
    });

    expect(task.status).toBe('failed');
    expect(task.event.status).toBe('failed');
    expect(task.event.message).toBe('请先完成手动审核');
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
