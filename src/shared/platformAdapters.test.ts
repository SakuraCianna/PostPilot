import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ADAPTERS,
  applyDraftValidation,
  createCustomPlatformAdapters,
  createLocalDrafts,
  validatePlatformDraft,
} from './platformAdapters';

describe('platform adapters', () => {
  it('defines three demo platform adapters with publish modes and presets', () => {
    expect(PLATFORM_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'wechat',
      'bilibili',
      'douyin',
    ]);

    for (const adapter of PLATFORM_ADAPTERS) {
      expect(adapter.publishModes.length).toBeGreaterThan(0);
      expect(adapter.capabilities.length).toBeGreaterThan(0);
      expect(adapter.limits.titleMax).toBeGreaterThan(0);
      expect(adapter.styleGuide).toContain('平台风格预设');
    }
  });

  it('creates one local draft per platform from canonical content', () => {
    const drafts = createLocalDrafts({
      title: 'How creators can publish faster',
      body: 'A practical note about adapting one article to many creator platforms.',
    });

    expect(drafts).toHaveLength(3);
    expect(drafts.every((draft) => draft.body.length > 0)).toBe(true);
    expect(drafts.find((draft) => draft.platformId === 'bilibili')?.hashtags).toContain(
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
          statusMessage: '平台预设已保存',
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
    expect(drafts).toHaveLength(4);
    expect(drafts.find((draft) => draft.platformId === 'threads')?.body).toContain(
      '适配要点',
    );
  });

  it('can match custom platform presets by display name for old local records', () => {
    const customAdapters = createCustomPlatformAdapters(
      [
        {
          platformId: 'legacy-generated-id',
          displayName: '小红书',
          builtIn: false,
          enabled: true,
          configured: true,
          status: 'configured',
          statusMessage: '平台预设已保存',
          maskedFields: {},
        },
      ],
      {
        小红书: '- 风格像可收藏笔记\n- 结尾增加评论引导',
      },
    );

    expect(customAdapters[0]?.displayName).toBe('小红书');
    expect(customAdapters[0]?.styleGuide).toContain('可收藏笔记');
    expect(customAdapters[0]?.tone).toContain('风格像可收藏笔记');
  });

  it('reports validation warnings for platform-specific limits in Chinese', () => {
    const warnings = validatePlatformDraft('douyin', {
      platformId: 'douyin',
      title: 'x'.repeat(60),
      body: 'short body',
      summary: '',
      hashtags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      status: 'ready',
    });

    expect(warnings).toContain('标题不能超过 55 个字符');
    expect(warnings).toContain('话题标签不能超过 8 个');
  });

  it('keeps generated drafts ready when validation still passes', () => {
    const draft = applyDraftValidation({
      platformId: 'bilibili',
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
      platformId: 'bilibili',
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
