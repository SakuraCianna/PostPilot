import { describe, expect, it } from 'vitest';
import { replacePlatformDraft } from './draftUpdates';
import type { PlatformDraft } from './types';

const baseDrafts: PlatformDraft[] = [
  {
    platformId: 'wechat',
    title: '原标题',
    summary: '原摘要',
    body: '原正文',
    hashtags: [],
    status: 'ready',
  },
  {
    platformId: 'zhihu',
    title: '知乎标题',
    summary: '知乎摘要',
    body: '知乎正文',
    hashtags: ['内容创作'],
    status: 'ready',
  },
];

describe('draft updates', () => {
  it('replaces one platform draft without changing draft order', () => {
    const updated = replacePlatformDraft(baseDrafts, {
      platformId: 'zhihu',
      title: '新标题',
      summary: '新摘要',
      body: '新正文',
      hashtags: ['效率工具'],
      status: 'ready',
    });

    expect(updated.map((draft) => draft.platformId)).toEqual(['wechat', 'zhihu']);
    expect(updated[0]?.title).toBe('原标题');
    expect(updated[1]?.title).toBe('新标题');
    expect(updated[1]?.hashtags).toEqual(['效率工具']);
  });

  it('throws a Chinese error when the platform draft does not exist', () => {
    expect(() =>
      replacePlatformDraft(baseDrafts, {
        platformId: 'bilibili',
        title: 'B 站标题',
        summary: 'B 站摘要',
        body: 'B 站正文',
        hashtags: [],
        status: 'ready',
      }),
    ).toThrow('未找到要更新的平台草稿');
  });
});
