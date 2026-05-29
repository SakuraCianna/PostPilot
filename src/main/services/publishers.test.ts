import { describe, expect, it } from 'vitest';
import { createPublishTask } from './publishers';
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
  it('creates a simulated publish task with Chinese message', () => {
    const task = createPublishTask({
      draft,
      mode: 'simulated',
    });

    expect(task.status).toBe('success');
    expect(task.event.status).toBe('success');
    expect(task.event.mode).toBe('simulated');
    expect(task.event.message).toBe('微信公众号 模拟发布已完成');
    expect(task.artifact).toBeUndefined();
  });

  it('creates an export task with draft content artifact', () => {
    const task = createPublishTask({
      draft,
      mode: 'exportOnly',
    });

    expect(task.status).toBe('success');
    expect(task.event.mode).toBe('exportOnly');
    expect(task.event.message).toBe('微信公众号 导出内容已生成');
    expect(task.artifact?.filename).toMatch(/^wechat-/);
    expect(task.artifact?.content).toContain('<p>正文</p>');
  });

  it('returns a pending official API task when connector is not implemented', () => {
    const task = createPublishTask({
      draft,
      mode: 'officialApi',
    });

    expect(task.status).toBe('pending');
    expect(task.event.status).toBe('failed');
    expect(task.event.message).toBe('微信公众号 官方接口发布尚未接入');
  });
});
