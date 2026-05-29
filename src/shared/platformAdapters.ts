import type { CanonicalContent, PlatformAdapter, PlatformDraft, PlatformId } from './types';

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  {
    id: 'wechat',
    displayName: '微信公众号',
    description: '适合长文排版, 摘要和封面草稿链路',
    tone: '专业, 清晰, 有结构',
    capabilities: ['HTML 长文', '摘要生成', '草稿发布预留接口'],
    publishModes: ['officialApi', 'simulated', 'exportOnly'],
    limits: { titleMax: 64, bodyMax: 20000, hashtagMax: 0 },
    exportFormat: 'html',
  },
  {
    id: 'zhihu',
    displayName: '知乎',
    description: '适合观点型文章, 强调问题意识和论证',
    tone: '理性, 有判断, 注重可信度',
    capabilities: ['Markdown 文章', '引用友好文案', '浏览器辅助预留接口'],
    publishModes: ['browserAssist', 'simulated', 'exportOnly'],
    limits: { titleMax: 80, bodyMax: 30000, hashtagMax: 5 },
    exportFormat: 'markdown',
  },
  {
    id: 'bilibili',
    displayName: 'B 站',
    description: '适合视频简介, 分区标签和互动引导',
    tone: '轻松, 直接, 有互动感',
    capabilities: ['视频简介', '标签建议', '官方接口预留接口'],
    publishModes: ['officialApi', 'browserAssist', 'simulated', 'exportOnly'],
    limits: { titleMax: 80, bodyMax: 2000, hashtagMax: 10 },
    exportFormat: 'plain',
  },
  {
    id: 'xiaohongshu',
    displayName: '小红书',
    description: '适合短标题, 种草口吻和话题标签',
    tone: '自然, 口语化, 强调收获感',
    capabilities: ['短笔记', '话题标签', '浏览器辅助预留接口'],
    publishModes: ['browserAssist', 'simulated', 'exportOnly'],
    limits: { titleMax: 20, bodyMax: 1000, hashtagMax: 6 },
    exportFormat: 'plain',
  },
];

const PLATFORM_BY_ID = new Map(PLATFORM_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getPlatformAdapter(platformId: PlatformId): PlatformAdapter {
  const adapter = PLATFORM_BY_ID.get(platformId);
  if (!adapter) {
    throw new Error(`未知平台: ${platformId}`);
  }
  return adapter;
}

export function createLocalDrafts(content: CanonicalContent): PlatformDraft[] {
  const title = normalizeTitle(content.title, content.body);
  const plainBody = stripMarkdown(content.body);
  const summary = createSummary(plainBody);

  return [
    withWarnings({
      platformId: 'wechat',
      title: clipText(title, 64),
      summary,
      body: toWechatHtml(title, plainBody),
      hashtags: [],
      status: 'ready',
    }),
    withWarnings({
      platformId: 'zhihu',
      title: clipText(title, 80),
      summary,
      body: `# ${clipText(title, 80)}\n\n${plainBody}\n\n---\n\n发布前检查: 补充来源, 调整小标题, 确认评论区引导`,
      hashtags: ['内容创作', '效率工具'],
      status: 'ready',
    }),
    withWarnings({
      platformId: 'bilibili',
      title: clipText(title, 80),
      summary,
      body: `${summary}\n\n本期要点:\n${createBulletList(plainBody)}\n\n欢迎在评论区补充你的发布经验`,
      hashtags: ['内容创作', '效率工具', '自媒体'],
      status: 'ready',
    }),
    withWarnings({
      platformId: 'xiaohongshu',
      title: clipText(title, 20),
      summary,
      body: `${summary}\n\n${clipText(plainBody, 620)}\n\n适合想把一篇内容同步到多个平台的创作者`,
      hashtags: ['内容创作', '自媒体', '效率工具', '创作者工具'],
      status: 'ready',
    }),
  ];
}

export function validatePlatformDraft(platformId: PlatformId, draft: PlatformDraft): string[] {
  const adapter = getPlatformAdapter(platformId);
  const warnings: string[] = [];

  if (!draft.title.trim()) {
    warnings.push('标题不能为空');
  }

  if (draft.title.length > adapter.limits.titleMax) {
    warnings.push(`标题不能超过 ${adapter.limits.titleMax} 个字符`);
  }

  if (adapter.limits.bodyMax && draft.body.length > adapter.limits.bodyMax) {
    warnings.push(`正文不能超过 ${adapter.limits.bodyMax} 个字符`);
  }

  if (draft.hashtags.length > adapter.limits.hashtagMax) {
    warnings.push(`话题标签不能超过 ${adapter.limits.hashtagMax} 个`);
  }

  if (platformId === 'wechat' && !draft.summary.trim()) {
    warnings.push('微信公众号建议填写摘要');
  }

  return warnings;
}

export function normalizeDraft(draft: PlatformDraft): PlatformDraft {
  return applyDraftValidation({
    ...draft,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    body: draft.body.trim(),
    hashtags: draft.hashtags.map((tag) => tag.trim()).filter(Boolean),
  });
}

export function applyDraftValidation(draft: PlatformDraft): PlatformDraft {
  const warnings = validatePlatformDraft(draft.platformId, draft);
  return {
    ...draft,
    status: warnings.length > 0 ? 'needs-review' : draft.status,
    warnings,
  };
}

export function formatDraftForClipboard(draft: PlatformDraft): string {
  const adapter = getPlatformAdapter(draft.platformId);
  const tags = draft.hashtags.length > 0 ? `\n\n${draft.hashtags.map((tag) => `#${tag}`).join(' ')}` : '';

  if (adapter.exportFormat === 'html') {
    return `${draft.body}${tags}`;
  }

  return `${draft.title}\n\n${draft.summary}\n\n${draft.body}${tags}`.trim();
}

function withWarnings(draft: PlatformDraft): PlatformDraft {
  const warnings = validatePlatformDraft(draft.platformId, draft);
  return {
    ...draft,
    status: warnings.length > 0 ? 'needs-review' : draft.status,
    warnings,
  };
}

function normalizeTitle(title: string, body: string): string {
  const trimmedTitle = title.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const firstLine = stripMarkdown(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? clipText(firstLine, 48) : '未命名内容';
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*_`~\-[\]]/g, '')
    .replace(/\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/\r\n/g, '\n')
    .trim();
}

function createSummary(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return clipText(compact || '这是一篇待适配的创作者内容', 120);
}

function createBulletList(value: string): string {
  const sentences = value
    .split(/[。.!?\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (sentences.length === 0) {
    return '- 梳理核心观点\n- 适配平台表达\n- 发布前完成检查';
  }

  return sentences.map((sentence) => `- ${clipText(sentence, 48)}`).join('\n');
}

function toWechatHtml(title: string, body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n');

  return `<h1>${escapeHtml(title)}</h1>\n${paragraphs}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clipText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}
