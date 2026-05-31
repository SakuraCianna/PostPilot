import fs from 'node:fs';
import path from 'node:path';
import type { PlatformPresetResearchResult } from '../../shared/types';

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilySearchResponse {
  answer?: string;
  results?: TavilySearchResult[];
}

export interface PlatformPresetResearchService {
  readPresetMarkdowns(): Record<string, string>;
  researchPlatformPreset(input: {
    platformId: string;
    displayName: string;
    apiKey?: string;
    fetchImpl?: typeof fetch;
  }): Promise<PlatformPresetResearchResult>;
}

export function createPlatformPresetResearchService(input: {
  presetDir: string;
}): PlatformPresetResearchService {
  function getPresetPath(platformId: string): string {
    return path.join(input.presetDir, `${normalizePlatformId(platformId)}.md`);
  }

  function writePreset(platformId: string, markdown: string): string {
    fs.mkdirSync(input.presetDir, { recursive: true });
    const presetPath = getPresetPath(platformId);
    fs.writeFileSync(presetPath, markdown, 'utf8');
    return presetPath;
  }

  return {
    readPresetMarkdowns(): Record<string, string> {
      if (!fs.existsSync(input.presetDir)) {
        return {};
      }

      return Object.fromEntries(
        fs
          .readdirSync(input.presetDir)
          .filter((filename) => filename.endsWith('.md'))
          .map((filename) => [
            path.basename(filename, '.md'),
            fs.readFileSync(path.join(input.presetDir, filename), 'utf8'),
          ]),
      );
    },

    async researchPlatformPreset({
      platformId,
      displayName,
      apiKey,
      fetchImpl,
    }): Promise<PlatformPresetResearchResult> {
      const normalizedPlatformId = normalizePlatformId(platformId);
      const updatedAt = new Date().toISOString();
      const trimmedApiKey = apiKey?.trim();

      if (!trimmedApiKey) {
        const markdown = createLocalPresetMarkdown(displayName, updatedAt);
        return {
          platformId: normalizedPlatformId,
          displayName,
          status: 'local-fallback',
          message: `${displayName} 平台风格预设已使用本地规则生成`,
          presetPath: writePreset(normalizedPlatformId, markdown),
          sources: [],
          updatedAt,
        };
      }

      try {
        const payload = await callTavily({
          displayName,
          apiKey: trimmedApiKey,
          fetchImpl: fetchImpl ?? fetch,
        });
        const sources = (payload.results ?? [])
          .filter((result) => result.title && result.url)
          .slice(0, 5)
          .map((result) => ({
            title: String(result.title),
            url: String(result.url),
          }));
        const markdown = createTavilyPresetMarkdown({
          displayName,
          updatedAt,
          answer: payload.answer,
          results: payload.results ?? [],
        });

        return {
          platformId: normalizedPlatformId,
          displayName,
          status: 'researched',
          message: `${displayName} 平台风格预设已通过 Tavily 更新`,
          presetPath: writePreset(normalizedPlatformId, markdown),
          sources,
          updatedAt,
        };
      } catch (error) {
        const markdown = createLocalPresetMarkdown(displayName, updatedAt);
        return {
          platformId: normalizedPlatformId,
          displayName,
          status: 'local-fallback',
          message:
            error instanceof Error
              ? `${displayName} Tavily 查询失败, 已使用本地规则生成预设: ${error.message}`
              : `${displayName} Tavily 查询失败, 已使用本地规则生成预设`,
          presetPath: writePreset(normalizedPlatformId, markdown),
          sources: [],
          updatedAt,
        };
      }
    },
  };
}

async function callTavily(input: {
  displayName: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): Promise<TavilySearchResponse> {
  const response = await input.fetchImpl('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `${input.displayName} 内容创作 发布 风格 标题 标签 运营 官方 创作者`,
      search_depth: 'advanced',
      include_answer: true,
      include_raw_content: false,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily 查询失败, HTTP 状态码 ${response.status}`);
  }

  return (await response.json()) as TavilySearchResponse;
}

function createTavilyPresetMarkdown(input: {
  displayName: string;
  updatedAt: string;
  answer?: string;
  results: TavilySearchResult[];
}): string {
  const sourceLines = input.results
    .filter((result) => result.title && result.url)
    .slice(0, 5)
    .map((result) => `- [${escapeMarkdown(String(result.title))}](${String(result.url)})`)
    .join('\n');
  const evidence = input.results
    .map((result) => result.content?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((content) => `- ${clipText(content ?? '', 160)}`)
    .join('\n');

  return [
    `# ${input.displayName} 平台风格预设`,
    '',
    `更新时间: ${input.updatedAt}`,
    '来源: Tavily 在线查询',
    '',
    '## 内容风格',
    input.answer?.trim() || `${input.displayName} 适合结合平台语境生成清晰、可读、便于互动的内容。`,
    '',
    '## 适配建议',
    '- 标题优先表达核心收益或主要看点',
    '- 正文保留原文信息增量, 避免虚构平台规则',
    '- 结尾增加自然互动引导',
    '- 标签数量保持克制, 优先选择内容主题词',
    '',
    '## 查询摘录',
    evidence || '- 暂无可用摘录',
    '',
    '## 参考来源',
    sourceLines || '- 暂无外部来源',
    '',
  ].join('\n');
}

function createLocalPresetMarkdown(displayName: string, updatedAt: string): string {
  return [
    `# ${displayName} 平台风格预设`,
    '',
    `更新时间: ${updatedAt}`,
    '来源: 本地兜底规则',
    '',
    '## 内容风格',
    `${displayName} 适合在保留原文核心信息的基础上, 调整为更贴近平台读者的表达。`,
    '',
    '## 适配建议',
    '- 标题直接说明主题和看点',
    '- 正文先给结论, 再展开关键要点',
    '- 语气保持自然, 避免夸大承诺',
    '- 结尾增加评论或收藏引导',
    '- 标签选择内容主题词和平台常见分类词',
    '',
  ].join('\n');
}

function normalizePlatformId(platformId: string): string {
  return platformId
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

function clipText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[[\]]/g, '\\$&');
}
