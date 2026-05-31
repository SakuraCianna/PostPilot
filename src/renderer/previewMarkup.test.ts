import { describe, expect, it } from 'vitest';
import {
  createDraftPreviewHtml,
  createUnsafeDraftPreviewHtml,
} from './previewMarkup';
import type { PlatformDraft } from '../shared/types';

const baseDraft: PlatformDraft = {
  platformId: 'bilibili',
  title: '预览标题',
  summary: '预览摘要',
  body: '',
  hashtags: [],
  status: 'ready',
};

describe('preview markup', () => {
  it('renders markdown body as preview html', () => {
    const html = createUnsafeDraftPreviewHtml(
      {
        ...baseDraft,
        body: '# 一级标题\n\n- 要点一\n- 要点二',
      },
      'markdown',
    );

    expect(html).toContain('<h1>一级标题</h1>');
    expect(html).toContain('<li>要点一</li>');
  });

  it('escapes plain text before preview rendering', () => {
    const html = createUnsafeDraftPreviewHtml(
      {
        ...baseDraft,
        body: '第一行\n<script>alert(1)</script>',
      },
      'plain',
    );

    expect(html).toContain('第一行<br />');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('passes html preview through a sanitizer before returning it', () => {
    const html = createDraftPreviewHtml(
      {
        ...baseDraft,
        body: '<h1>标题</h1><script>alert(1)</script>',
      },
      'html',
      (value) => value.replace(/<script[\s\S]*?<\/script>/g, ''),
    );

    expect(html).toBe('<h1>标题</h1>');
  });
});
