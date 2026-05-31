import { z } from 'zod';
import {
  DEEPSEEK_MODEL,
  type CanonicalContent,
  type ContentReviewIssue,
  type ContentReviewResult,
  type ContentReviewStatus,
  type ModelStatus,
  type PlatformDraft,
  type PlatformId,
} from '../../shared/types';
import { PLATFORM_ADAPTERS } from '../../shared/platformAdapters';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

const AiIssueSchema = z.object({
  kind: z.enum(['legal', 'values']),
  platformId: z.string().optional(),
  snippet: z.string().min(1),
  reason: z.string().min(1),
  suggestion: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
});

const ReviewPayloadSchema = z.object({
  issues: z.array(AiIssueSchema).default([]),
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

const LOCAL_RISK_RULES = [
  {
    kind: 'legal',
    snippets: [
      '保证收益',
      '稳赚不赔',
      '绝对安全',
      '国家级',
      '最高级',
      '第一品牌',
      '包治',
      '治愈',
      '无副作用',
      '未授权转载',
      '侵权',
      '盗版',
      '刷单',
      '套现',
      '赌博',
      '违法',
      'guaranteed profit',
      'risk free',
    ],
    reason: '可能涉及绝对化承诺, 违规营销或法律合规风险',
    suggestion: '改成有边界的事实描述, 补充条件限制和风险提示',
  },
  {
    kind: 'values',
    snippets: [
      '低端用户',
      '低端人口',
      '歧视',
      '仇恨',
      '羞辱',
      '地域黑',
      '性别对立',
      '煽动',
      '血腥',
      'hate speech',
    ],
    reason: '可能引发价值观, 群体标签或攻击性表达争议',
    suggestion: '改成中性, 尊重且聚焦行为或场景的表达',
  },
] as const;

export interface ReviewContentSafetyOptions {
  content: CanonicalContent;
  drafts: PlatformDraft[];
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function reviewContentSafety(
  options: ReviewContentSafetyOptions,
): Promise<ContentReviewResult> {
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    return createLocalReview(options, 'local-fallback', '未配置 DeepSeek API Key, 已使用本地风险词审查');
  }

  try {
    const response = await callDeepSeekReview(options, apiKey);
    const issues = parseDeepSeekReview(response);
    return createReviewResult({
      issues,
      modelStatus: 'ai',
      message: createReviewMessage(issues, 'DeepSeek 内容审查已完成'),
    });
  } catch {
    return createLocalReview(
      options,
      'error-fallback',
      'DeepSeek 内容审查失败, 已使用本地风险词兜底',
    );
  }
}

async function callDeepSeekReview(
  options: ReviewContentSafetyOptions,
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
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是 PostPilot 的中文内容合规审查员。只返回 JSON。请审查法律合规风险和价值观表达风险, 不要输出 Markdown。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            source: options.content,
            drafts: options.drafts,
            requiredShape: {
              issues: [
                {
                  kind: 'legal | values',
                  platformId: '内部平台 ID 或 optional',
                  snippet: 'string',
                  reason: 'string',
                  suggestion: 'string',
                  confidence: 'low | medium | high',
                },
              ],
            },
            rules: {
              legal: '法律, 广告法, 医疗健康, 金融收益承诺, 版权侵权, 平台禁限内容等风险',
              values: '歧视, 仇恨, 群体标签, 攻击性表达, 暴力血腥或不尊重表达等风险',
            },
            platformRules: PLATFORM_ADAPTERS.map((adapter) => ({
              id: adapter.id,
              displayName: adapter.displayName,
              tone: adapter.tone,
              limits: adapter.limits,
              styleGuide: adapter.styleGuide,
            })),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek 内容审查请求失败, HTTP 状态码 ${response.status}`);
  }

  return response.json();
}

function parseDeepSeekReview(payload: unknown): ContentReviewIssue[] {
  const completion = ChatCompletionSchema.parse(payload);
  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error('DeepSeek 内容审查返回内容缺少正文');
  }

  const parsed = ReviewPayloadSchema.parse(JSON.parse(content));
  return parsed.issues.map((issue, index) => ({
    id: `risk-${index + 1}`,
    kind: issue.kind,
    platformId: issue.platformId,
    snippet: issue.snippet.trim(),
    reason: issue.reason.trim(),
    suggestion: issue.suggestion.trim(),
    confidence: issue.confidence,
  }));
}

function createLocalReview(
  options: ReviewContentSafetyOptions,
  modelStatus: ModelStatus,
  baseMessage: string,
): ContentReviewResult {
  const issues = createLocalIssues(options.content, options.drafts);
  return createReviewResult({
    issues,
    modelStatus,
    message: createReviewMessage(issues, baseMessage),
  });
}

function createLocalIssues(
  content: CanonicalContent,
  drafts: PlatformDraft[],
): ContentReviewIssue[] {
  const targets: Array<{ platformId?: PlatformId; text: string }> = [
    {
      text: `${content.title}\n${content.body}`,
    },
    ...drafts.map((draft) => ({
      platformId: draft.platformId,
      text: `${draft.title}\n${draft.summary}\n${draft.body}\n${draft.hashtags.join(' ')}`,
    })),
  ];

  const issues: ContentReviewIssue[] = [];
  for (const target of targets) {
    for (const rule of LOCAL_RISK_RULES) {
      for (const snippet of rule.snippets) {
        if (!target.text.toLowerCase().includes(snippet.toLowerCase())) {
          continue;
        }

        const exists = issues.some(
          (issue) => issue.snippet === snippet && issue.platformId === target.platformId,
        );
        if (exists) {
          continue;
        }

        issues.push({
          id: `risk-${issues.length + 1}`,
          kind: rule.kind,
          platformId: target.platformId,
          snippet,
          reason: rule.reason,
          suggestion: rule.suggestion,
          confidence: 'medium',
        });
      }
    }
  }

  return issues;
}

function createReviewResult(input: {
  issues: ContentReviewIssue[];
  modelStatus: ModelStatus;
  message: string;
}): ContentReviewResult {
  return {
    status: getReviewStatus(input.issues),
    model: DEEPSEEK_MODEL,
    modelStatus: input.modelStatus,
    message: input.message,
    reviewedAt: new Date().toISOString(),
    issues: input.issues,
  };
}

function getReviewStatus(issues: ContentReviewIssue[]): ContentReviewStatus {
  if (issues.some((issue) => issue.kind === 'legal')) {
    return 'blocked';
  }
  if (issues.length > 0) {
    return 'needs-attention';
  }
  return 'passed';
}

function createReviewMessage(issues: ContentReviewIssue[], baseMessage: string): string {
  const legalCount = issues.filter((issue) => issue.kind === 'legal').length;
  const valuesCount = issues.filter((issue) => issue.kind === 'values').length;

  if (legalCount > 0) {
    return `${baseMessage}, 发现 ${legalCount} 条法律风险, 已拦截发布`;
  }
  if (valuesCount > 0) {
    return `${baseMessage}, 发现 ${valuesCount} 条价值观风险, 发布前请关注`;
  }
  return `${baseMessage}, 未发现明显风险`;
}
