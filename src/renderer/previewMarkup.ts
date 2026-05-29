import { marked } from 'marked';
import type { PlatformAdapter, PlatformDraft } from '../shared/types';

export type PreviewFormat = PlatformAdapter['exportFormat'];
export type PreviewSanitizer = (value: string) => string;

export function createDraftPreviewHtml(
  draft: PlatformDraft,
  format: PreviewFormat,
  sanitize: PreviewSanitizer,
): string {
  return sanitize(createUnsafeDraftPreviewHtml(draft, format));
}

export function createUnsafeDraftPreviewHtml(
  draft: PlatformDraft,
  format: PreviewFormat,
): string {
  if (format === 'html') {
    return draft.body;
  }

  if (format === 'markdown') {
    const parsed = marked.parse(draft.body, {
      async: false,
      breaks: true,
      gfm: true,
    });
    return typeof parsed === 'string' ? parsed : '';
  }

  return plainTextToHtml(draft.body);
}

function plainTextToHtml(value: string): string {
  const escaped = escapeHtml(value.trim());
  if (!escaped) {
    return '<p>暂无正文内容</p>';
  }

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
