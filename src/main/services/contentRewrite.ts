import { z } from 'zod';
import { normalizeDraft, PLATFORM_ADAPTERS } from '../../shared/platformAdapters';
import {
  DEEPSEEK_MODEL,
  type CanonicalContent,
  type ContentReviewIssue,
  type ContentReviewResult,
  type DeepSeekModel,
  type ModelStatus,
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
  status: z.enum(['ready', 'needs-review']).default('needs-review'),
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

const RISK_REWRITE_REPLACEMENTS = new Map<string, string>([
  ['保证收益', '在符合条件时可能带来收益'],
  ['稳赚不赔', '收益存在波动和风险'],
  ['绝对安全', '安全性需要结合实际情况评估'],
  ['国家级', '较高标准'],
  ['最高级', '较高水平'],
  ['第一品牌', '有代表性的品牌'],
  ['包治', '可能有助于改善'],
  ['治愈', '辅助改善'],
  ['无副作用', '需结合个体情况评估'],
  ['未授权转载', '引用前请确认授权'],
  ['侵权', '版权风险'],
  ['盗版', '未授权内容'],
  ['刷单', '异常交易'],
  ['套现', '不合规资金操作'],
  ['赌博', '高风险活动'],
  ['违法', '不合规'],
  ['guaranteed profit', 'potential return with clear conditions'],
  ['risk free', 'risk-aware'],
  ['低端用户', '目标用户'],
  ['低端人口', '特定人群'],
  ['歧视', '不当标签'],
  ['仇恨', '强烈负面表达'],
  ['羞辱', '不尊重表达'],
  ['地域黑', '地域刻板印象'],
  ['性别对立', '性别议题争议'],
  ['煽动', '情绪化引导'],
  ['血腥', '强刺激内容'],
  ['hate speech', 'harmful expression'],
]);

export interface RewriteContentRisksOptions {
  content: CanonicalContent;
  drafts: PlatformDraft[];
  review: ContentReviewResult;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface RewriteContentRisksResult {
  drafts: PlatformDraft[];
  model: DeepSeekModel;
  modelStatus: ModelStatus;
  message: string;
}

export async function rewriteContentRisks(
  options: RewriteContentRisksOptions,
): Promise<RewriteContentRisksResult> {
  const localDrafts = createLocalRewriteDrafts(options.drafts, options.review);
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    return {
      drafts: localDrafts,
      model: DEEPSEEK_MODEL,
      modelStatus: 'local-fallback',
      message: '未配置 DeepSeek API Key, 已使用本地规则优化风险表达, 请重新进行 AI 审查',
    };
  }

  try {
    const response = await callDeepSeekRewrite(options, apiKey);
    const aiDrafts = parseDeepSeekDrafts(response);

    return {
      drafts: mergeDrafts(aiDrafts, localDrafts),
      model: DEEPSEEK_MODEL,
      modelStatus: 'ai',
      message: '已使用 DeepSeek 优化风险表达, 请重新进行 AI 审查',
    };
  } catch {
    return {
      drafts: localDrafts,
      model: DEEPSEEK_MODEL,
      modelStatus: 'error-fallback',
      message: 'DeepSeek 风险表达优化失败, 已使用本地规则兜底, 请重新进行 AI 审查',
    };
  }
}

async function callDeepSeekRewrite(
  options: RewriteContentRisksOptions,
  apiKey: string,
): Promise<unknown> {
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
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是 PostPilot 的中文内容合规改写员。只返回 JSON。请在不新增事实的前提下, 优化法律风险和价值观风险表达, 保留各平台格式。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            source: options.content,
            review: options.review,
            drafts: options.drafts,
            requiredShape: {
              drafts: [
                {
                  platformId: '内部平台 ID',
                  title: 'string',
                  summary: 'string',
                  body: 'string',
                  hashtags: ['string'],
                  status: 'ready',
                },
              ],
            },
            rules: [
              '只改写审查问题相关表达',
              '不要删除核心观点',
              '不要新增数据, 案例, 背书或法律结论',
              '所有返回草稿都必须保持 ready, 发布前仍需要重新进行 AI 审查',
            ],
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
    throw new Error(`DeepSeek 风险表达优化请求失败, HTTP 状态码 ${response.status}`);
  }

  return response.json();
}

function parseDeepSeekDrafts(payload: unknown): PlatformDraft[] {
  const completion = ChatCompletionSchema.parse(payload);
  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error('DeepSeek 风险表达优化返回内容缺少正文');
  }

  const parsed = DraftBundleSchema.parse(JSON.parse(content));
  return parsed.drafts.map((draft) => normalizeDraft({ ...draft, status: 'ready' }));
}

function createLocalRewriteDrafts(
  drafts: PlatformDraft[],
  review: ContentReviewResult,
): PlatformDraft[] {
  return drafts.map((draft) => {
    const relatedIssues = review.issues.filter(
      (issue) => !issue.platformId || issue.platformId === draft.platformId,
    );

    const rewritten = relatedIssues.reduce(
      (current, issue) => rewriteDraftByIssue(current, issue),
      draft,
    );

    return normalizeDraft({
      ...rewritten,
      status: 'ready',
    });
  });
}

function rewriteDraftByIssue(draft: PlatformDraft, issue: ContentReviewIssue): PlatformDraft {
  const replacement = getReplacement(issue);

  return {
    ...draft,
    title: replaceRiskSnippet(draft.title, issue.snippet, replacement),
    summary: replaceRiskSnippet(draft.summary, issue.snippet, replacement),
    body: replaceRiskSnippet(draft.body, issue.snippet, replacement),
    hashtags: draft.hashtags.map((tag) => replaceRiskSnippet(tag, issue.snippet, replacement)),
  };
}

function getReplacement(issue: ContentReviewIssue): string {
  const snippet = issue.snippet.trim();
  return (
    RISK_REWRITE_REPLACEMENTS.get(snippet) ??
    RISK_REWRITE_REPLACEMENTS.get(snippet.toLowerCase()) ??
    (issue.kind === 'legal' ? '有边界的表达' : '中性表达')
  );
}

function replaceRiskSnippet(value: string, snippet: string, replacement: string): string {
  const trimmedSnippet = snippet.trim();
  if (!trimmedSnippet) {
    return value;
  }

  return value.replace(
    new RegExp(escapeRegExp(trimmedSnippet), hasAscii(trimmedSnippet) ? 'gi' : 'g'),
    replacement,
  );
}

function mergeDrafts(aiDrafts: PlatformDraft[], localDrafts: PlatformDraft[]): PlatformDraft[] {
  const aiByPlatform = new Map<PlatformId, PlatformDraft>(
    aiDrafts.map((draft) => [draft.platformId, draft]),
  );

  return localDrafts
    .map((draft) => aiByPlatform.get(draft.platformId) ?? draft)
    .map((draft) => normalizeDraft({ ...draft, status: 'ready' }));
}

function hasAscii(value: string): boolean {
  return /[a-z]/i.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
