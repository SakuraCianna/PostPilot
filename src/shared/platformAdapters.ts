import { DEFAULT_PLATFORM_PRESETS } from './defaultPlatformPresets';
import type {
  CanonicalContent,
  PlatformAccountConfig,
  PlatformAdapter,
  PlatformDraft,
  PlatformId,
} from './types';

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  {
    id: 'wechat',
    displayName: '微信公众号',
    description: '适合长文排版, 摘要和封面草稿链路',
    tone: '专业, 清晰, 有结构',
    capabilities: ['HTML 长文', '摘要生成', '模拟发布', '内置风格预设'],
    publishModes: ['simulated'],
    limits: { titleMax: 64, bodyMax: 20000, hashtagMax: 0 },
    exportFormat: 'html',
    styleGuide: DEFAULT_PLATFORM_PRESETS.wechat,
  },
  {
    id: 'bilibili',
    displayName: '哔哩哔哩',
    description: '适合视频简介, 分区标签和互动引导',
    tone: '轻松, 直接, 有互动感',
    capabilities: ['视频简介', '标签建议', '模拟发布', '内置风格预设'],
    publishModes: ['simulated'],
    limits: { titleMax: 80, bodyMax: 2000, hashtagMax: 10 },
    exportFormat: 'plain',
    styleGuide: DEFAULT_PLATFORM_PRESETS.bilibili,
  },
  {
    id: 'douyin',
    displayName: '抖音',
    description: '适合短视频标题, 看点前置和评论互动',
    tone: '短促, 有钩子, 强互动',
    capabilities: ['短视频标题', '口播简介', '模拟发布', '内置风格预设'],
    publishModes: ['simulated'],
    limits: { titleMax: 55, bodyMax: 1000, hashtagMax: 8 },
    exportFormat: 'plain',
    styleGuide: DEFAULT_PLATFORM_PRESETS.douyin,
  },
];

const PLATFORM_BY_ID = new Map(PLATFORM_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getPlatformAdapter(
  platformId: PlatformId,
  customAdapters: PlatformAdapter[] = [],
): PlatformAdapter {
  const adapter =
    PLATFORM_BY_ID.get(platformId) ?? customAdapters.find((item) => item.id === platformId);
  return adapter ?? createCustomPlatformAdapter(platformId, platformId);
}

export function createCustomPlatformAdapters(
  configs: PlatformAccountConfig[],
  styleGuides: Record<string, string> = {},
): PlatformAdapter[] {
  return configs
    .filter((config) => !config.builtIn && config.enabled && config.configured)
    .map((config) =>
      createCustomPlatformAdapter(
        config.platformId,
        config.displayName,
        styleGuides[config.platformId],
      ),
    );
}

export function createCustomPlatformAdapter(
  platformId: string,
  displayName: string,
  styleGuide = '',
): PlatformAdapter {
  return {
    id: platformId,
    displayName,
    description: '适合自定义平台的通用文本发布流程',
    tone: extractPresetTone(styleGuide) || '贴近原文, 保持清晰, 便于二次编辑',
    capabilities: ['通用文本草稿', '平台风格预设', '模拟发布'],
    publishModes: ['simulated'],
    limits: { titleMax: 80, bodyMax: 10000, hashtagMax: 8 },
    exportFormat: 'plain',
    styleGuide,
  };
}

export function createLocalDrafts(
  content: CanonicalContent,
  customAdapters: PlatformAdapter[] = [],
): PlatformDraft[] {
  const title = normalizeTitle(content.title, content.body);
  const plainBody = stripMarkdown(content.body);
  const summary = createSummary(plainBody);

  const builtInDrafts = PLATFORM_ADAPTERS.map((adapter) =>
    withWarnings(createDraftForAdapter(adapter, title, plainBody, summary), adapter),
  );

  const customDrafts = customAdapters.map((adapter) =>
    withWarnings(
      {
        platformId: adapter.id,
        title: clipText(title, adapter.limits.titleMax),
        summary,
        body: createCustomDraftBody(plainBody, summary, adapter),
        hashtags: ['内容创作', '效率工具'],
        status: 'ready',
      },
      adapter,
    ),
  );

  return [...builtInDrafts, ...customDrafts];
}

function createDraftForAdapter(
  adapter: PlatformAdapter,
  title: string,
  plainBody: string,
  summary: string,
): PlatformDraft {
  if (adapter.id === 'wechat') {
    return {
      platformId: adapter.id,
      title: clipText(title, adapter.limits.titleMax),
      summary,
      body: toWechatHtml(title, plainBody),
      hashtags: [],
      status: 'ready',
    };
  }

  if (adapter.id === 'bilibili') {
    return {
      platformId: adapter.id,
      title: clipText(title, adapter.limits.titleMax),
      summary,
      body: `${summary}\n\n本期要点:\n${createBulletList(plainBody)}\n\n欢迎在评论区补充你的发布经验`,
      hashtags: ['内容创作', '效率工具', '自媒体'],
      status: 'ready',
    };
  }

  if (adapter.id === 'douyin') {
    return {
      platformId: adapter.id,
      title: clipText(title, adapter.limits.titleMax),
      summary,
      body: `${clipText(summary, 90)}\n\n看点:\n${createBulletList(plainBody)}\n\n评论区聊聊你的做法。`,
      hashtags: ['创作者工具', '内容效率', '自媒体'],
      status: 'ready',
    };
  }

  return {
    platformId: adapter.id,
    title: clipText(title, adapter.limits.titleMax),
    summary,
    body: `${summary}\n\n${plainBody}\n\n适合需要清晰信息增量和结构化表达的读者。`,
    hashtags: ['内容创作', '效率工具'],
    status: 'ready',
  };
}

function createCustomDraftBody(
  plainBody: string,
  summary: string,
  adapter: PlatformAdapter,
): string {
  const hints = extractPresetHighlights(adapter.styleGuide);
  const hintText =
    hints.length > 0 ? `\n\n适配要点:\n${hints.map((hint) => `- ${hint}`).join('\n')}` : '';
  return `${summary}\n\n${clipText(plainBody, 1200)}${hintText}`;
}

export function validatePlatformDraft(
  platformId: PlatformId,
  draft: PlatformDraft,
  adapterOverride?: PlatformAdapter,
): string[] {
  const adapter = adapterOverride ?? getPlatformAdapter(platformId);
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

export function formatDraftForClipboard(
  draft: PlatformDraft,
  adapterOverride?: PlatformAdapter,
): string {
  const adapter = adapterOverride ?? getPlatformAdapter(draft.platformId);
  const tags =
    draft.hashtags.length > 0 ? `\n\n${draft.hashtags.map((tag) => `#${tag}`).join(' ')}` : '';

  if (adapter.exportFormat === 'html') {
    return `${draft.body}${tags}`;
  }

  return `${draft.title}\n\n${draft.summary}\n\n${draft.body}${tags}`.trim();
}

function withWarnings(draft: PlatformDraft, adapterOverride?: PlatformAdapter): PlatformDraft {
  const warnings = validatePlatformDraft(draft.platformId, draft, adapterOverride);
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

function extractPresetTone(styleGuide: string): string {
  const toneLine = styleGuide
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes('语气') || line.includes('风格') || line.includes('表达'));

  return toneLine
    ? toneLine.replace(/^[-#*\s]+/, '').replace(/^内容风格[:：]?/, '').trim()
    : '';
}

function extractPresetHighlights(styleGuide = ''): string[] {
  return styleGuide
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => /标题|语气|标签|互动|结构|风格|发布/.test(line))
    .slice(0, 3)
    .map((line) => clipText(line, 42));
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
