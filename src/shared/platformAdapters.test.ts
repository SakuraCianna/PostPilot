import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ADAPTERS,
  applyDraftValidation,
  createCustomPlatformAdapters,
  createLocalDrafts,
  validatePlatformDraft,
} from './platformAdapters';

describe('platform adapters', () => {
  it('defines four extensible platform adapters with publish modes', () => {
    expect(PLATFORM_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'wechat',
      'zhihu',
      'bilibili',
      'xiaohongshu',
      'douyin',
      'kuaishou',
      'weibo',
      'toutiao',
      'baijiahao',
    ]);

    for (const adapter of PLATFORM_ADAPTERS) {
      expect(adapter.publishModes.length).toBeGreaterThan(0);
      expect(adapter.capabilities.length).toBeGreaterThan(0);
      expect(adapter.limits.titleMax).toBeGreaterThan(0);
    }
  });

  it('creates one local draft per platform from canonical content', () => {
    const drafts = createLocalDrafts({
      title: 'How creators can publish faster',
      body: 'A practical note about adapting one article to many creator platforms.',
    });

    expect(drafts).toHaveLength(9);
    expect(drafts.every((draft) => draft.body.length > 0)).toBe(true);
    expect(drafts.find((draft) => draft.platformId === 'xiaohongshu')?.hashtags).toContain(
      '内容创作',
    );
  });

  it('creates usable drafts for enabled custom platforms', () => {
    const customAdapters = createCustomPlatformAdapters(
      [
        {
          platformId: 'threads',
          displayName: 'Threads',
          builtIn: false,
          enabled: true,
          configured: true,
          status: 'configured',
          statusMessage: '账号配置已保存',
          maskedFields: {},
        },
      ],
      {
        threads: '- 标题直接说明主题\n- 语气自然\n- 结尾增加互动',
      },
    );
    const drafts = createLocalDrafts(
      {
        title: '多平台发布',
        body: '把一篇内容同步到多个平台。',
      },
      customAdapters,
    );

    expect(customAdapters[0]).toMatchObject({
      id: 'threads',
      displayName: 'Threads',
      publishModes: ['simulated'],
    });
    expect(drafts).toHaveLength(10);
    expect(drafts.find((draft) => draft.platformId === 'threads')?.body).toContain(
      '适配要点',
    );
  });

  it('reports validation warnings for platform-specific limits in Chinese', () => {
    const warnings = validatePlatformDraft('xiaohongshu', {
      platformId: 'xiaohongshu',
      title: 'x'.repeat(30),
      body: 'short body',
      summary: '',
      hashtags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      status: 'ready',
    });

    expect(warnings).toContain('标题不能超过 20 个字符');
    expect(warnings).toContain('话题标签不能超过 6 个');
  });

  it('keeps generated drafts ready when validation still passes', () => {
    const draft = applyDraftValidation({
      platformId: 'zhihu',
      title: '标题',
      summary: '摘要',
      body: '正文',
      hashtags: ['内容创作'],
      status: 'ready',
    });

    expect(draft.status).toBe('ready');
    expect(draft.warnings).toEqual([]);
  });

  it('keeps approved drafts ready when validation still passes', () => {
    const draft = applyDraftValidation({
      platformId: 'zhihu',
      title: '标题',
      summary: '摘要',
      body: '正文',
      hashtags: ['内容创作'],
      status: 'ready',
    });

    expect(draft.status).toBe('ready');
    expect(draft.warnings).toEqual([]);
  });

  it('marks invalid drafts as needing regeneration or source fixes', () => {
    const draft = applyDraftValidation({
      platformId: 'wechat',
      title: '',
      summary: '',
      body: '<p>正文</p>',
      hashtags: [],
      status: 'ready',
    });

    expect(draft.status).toBe('needs-review');
    expect(draft.warnings).toEqual(['标题不能为空', '微信公众号建议填写摘要']);
  });
});
