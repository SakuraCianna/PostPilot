import { z } from 'zod';
import {
  createLocalDrafts,
  normalizeDraft,
  PLATFORM_ADAPTERS,
} from '../../shared/platformAdapters';
import {
  DEEPSEEK_MODEL,
  type AdaptationResult,
  type CanonicalContent,
  type PlatformDraft,
  type PlatformId,
} from '../../shared/types';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

const DraftSchema = z.object({
  platformId: z.string(),
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  hashtags: z.array(z.string()).default([]),
  status: z.enum(['ready', 'needs-review']).default('ready'),
});

const DraftBundleSchema = z.object({
  drafts: z.array(DraftSchema),
});

const ChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    }),
  ),
});

export interface GenerateAdaptationsOptions {
  content: CanonicalContent;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function generateAdaptations(
  options: GenerateAdaptationsOptions,
): Promise<AdaptationResult> {
  const localDrafts = createLocalDrafts(options.content);
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    return {
      drafts: localDrafts,
      model: DEEPSEEK_MODEL,
      modelStatus: 'local-fallback',
      modelMessage: '未配置 DeepSeek API Key, 已使用本地规则生成平台版本',
    };
  }

  try {
    const response = await callDeepSeek(options, apiKey);
    const aiDrafts = parseDeepSeekDrafts(response);

    return {
      drafts: mergeDrafts(aiDrafts, localDrafts),
      model: DEEPSEEK_MODEL,
      modelStatus: 'ai',
      modelMessage: '已使用 DeepSeek 生成平台版本',
    };
  } catch (error) {
    return {
      drafts: localDrafts,
      model: DEEPSEEK_MODEL,
      modelStatus: 'error-fallback',
      modelMessage: toChineseDeepSeekError(error),
    };
  }
}

async function callDeepSeek(options: GenerateAdaptationsOptions, apiKey: string): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是 PostPilot, 一个中文创作者发布助手。只返回 JSON。请把原始内容适配成微信公众号, 哔哩哔哩, 抖音三个内置平台版本。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            source: options.content,
            requiredShape: {
              drafts: [
                {
                  platformId: '平台标识',
                  title: 'string',
                  summary: 'string',
                  body: 'string',
                  hashtags: ['string'],
                  status: 'ready',
                },
              ],
            },
            platformRules: PLATFORM_ADAPTERS.map((adapter) => ({
              id: adapter.id,
              displayName: adapter.displayName,
              tone: adapter.tone,
              limits: adapter.limits,
              exportFormat: adapter.exportFormat,
              styleGuide: adapter.styleGuide,
            })),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败, HTTP 状态码 ${response.status}`);
  }

  return response.json();
}

function parseDeepSeekDrafts(payload: unknown): PlatformDraft[] {
  const completion = ChatCompletionSchema.parse(payload);
  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error('DeepSeek 返回内容缺少正文');
  }

  const parsed = DraftBundleSchema.parse(JSON.parse(content));
  return parsed.drafts.map((draft) => normalizeDraft(draft));
}

function mergeDrafts(aiDrafts: PlatformDraft[], localDrafts: PlatformDraft[]): PlatformDraft[] {
  const aiByPlatform = new Map<PlatformId, PlatformDraft>(
    aiDrafts.map((draft) => [draft.platformId, draft]),
  );

  return PLATFORM_ADAPTERS.map(
    (adapter) =>
      aiByPlatform.get(adapter.id) ??
      localDrafts.find((draft) => draft.platformId === adapter.id),
  )
    .filter((draft): draft is PlatformDraft => Boolean(draft))
    .map((draft) => normalizeDraft({ ...draft, status: 'ready' }));
}

function toChineseDeepSeekError(error: unknown): string {
  if (error instanceof Error && /^[\u4e00-\u9fff]/.test(error.message)) {
    return `${error.message}, 已使用本地规则生成平台版本`;
  }
  return 'DeepSeek 生成失败, 已使用本地规则生成平台版本';
}
