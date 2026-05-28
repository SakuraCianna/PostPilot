import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ADAPTERS,
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

    expect(drafts).toHaveLength(4);
    expect(drafts.every((draft) => draft.body.length > 0)).toBe(true);
    expect(drafts.find((draft) => draft.platformId === 'xiaohongshu')?.hashtags).toContain(
      '内容创作',
    );
  });

  it('reports validation warnings for platform-specific limits', () => {
    const warnings = validatePlatformDraft('xiaohongshu', {
      platformId: 'xiaohongshu',
      title: 'x'.repeat(30),
      body: 'short body',
      summary: '',
      hashtags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      status: 'ready',
    });

    expect(warnings).toContain('Title should be 20 characters or less.');
    expect(warnings).toContain('Use no more than 6 hashtags.');
  });
});
