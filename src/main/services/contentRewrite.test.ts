import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_MODEL,
  type ContentReviewResult,
  type PlatformDraft,
} from '../../shared/types';
import { rewriteContentRisks } from './contentRewrite';

const riskyDrafts: PlatformDraft[] = [
  {
    platformId: 'wechat',
    title: '收益承诺',
    summary: '保证收益, 覆盖低端用户',
    body: '<p>这个方案保证收益, 面向低端用户。</p>',
    hashtags: [],
    status: 'ready',
  },
  {
    platformId: 'bilibili',
    title: '收益承诺',
    summary: '普通摘要',
    body: '这个方案保证收益, 面向低端用户。',
    hashtags: ['效率工具'],
    status: 'ready',
  },
];

const review: ContentReviewResult = {
  status: 'blocked',
  model: DEEPSEEK_MODEL,
  modelStatus: 'local-fallback',
  message: '发现风险',
  reviewedAt: '2026-05-29T00:00:00.000Z',
  issues: [
    {
      id: 'risk-1',
      kind: 'legal',
      snippet: '保证收益',
      reason: '可能涉及绝对化承诺',
      suggestion: '改成有边界的事实描述',
      confidence: 'medium',
    },
    {
      id: 'risk-2',
      kind: 'values',
      platformId: 'wechat',
      snippet: '低端用户',
      reason: '可能带有贬损表达',
      suggestion: '改成中性描述',
      confidence: 'medium',
    },
  ],
};

describe('content rewrite service', () => {
  it('rewrites risky snippets locally and keeps drafts publishable after AI review reruns', async () => {
    const result = await rewriteContentRisks({
      content: {
        title: '收益承诺',
        body: '这个方案保证收益, 面向低端用户。',
      },
      drafts: riskyDrafts,
      review,
      apiKey: '',
    });

    expect(result.model).toBe(DEEPSEEK_MODEL);
    expect(result.modelStatus).toBe('local-fallback');
    expect(result.message).toContain('本地规则');
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts.every((draft) => draft.status === 'ready')).toBe(true);
    expect(result.drafts[0]?.body).not.toContain('保证收益');
    expect(result.drafts[0]?.body).not.toContain('低端用户');
    expect(result.drafts[1]?.body).not.toContain('保证收益');
    expect(result.drafts[1]?.body).toContain('低端用户');
  });

  it('requests DeepSeek JSON rewrite and normalizes drafts', async () => {
    const calls: unknown[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  drafts: [
                    {
                      platformId: 'wechat',
                      title: '收益提示',
                      summary: '收益需要结合条件评估',
                      body: '<p>这个方案可能带来效率提升, 面向目标用户。</p>',
                      hashtags: [],
                      status: 'ready',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );
    };

    const result = await rewriteContentRisks({
      content: {
        title: '收益承诺',
        body: '这个方案保证收益, 面向低端用户。',
      },
      drafts: riskyDrafts,
      review,
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect((calls[0] as { model: string }).model).toBe(DEEPSEEK_MODEL);
    expect((calls[0] as { response_format: { type: string } }).response_format.type).toBe(
      'json_object',
    );
    expect(result.modelStatus).toBe('ai');
    expect(result.drafts[0]).toMatchObject({
      platformId: 'wechat',
      title: '收益提示',
      status: 'ready',
    });
    expect(result.drafts[1]?.platformId).toBe('bilibili');
    expect(result.drafts[1]?.status).toBe('ready');
  });

  it('keeps custom platform drafts when AI only returns built-in platform drafts', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  drafts: [
                    {
                      platformId: 'wechat',
                      title: '收益提示',
                      summary: '收益需要结合条件评估',
                      body: '<p>这个方案可能带来效率提升。</p>',
                      hashtags: [],
                      status: 'ready',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );

    const result = await rewriteContentRisks({
      content: {
        title: '收益承诺',
        body: '这个方案保证收益。',
      },
      drafts: [
        riskyDrafts[0]!,
        {
          platformId: 'threads',
          title: 'Threads 标题',
          summary: '保证收益',
          body: '这个方案保证收益。',
          hashtags: [],
          status: 'ready',
        },
      ],
      review,
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(result.drafts.map((draft) => draft.platformId)).toEqual(['wechat', 'threads']);
    expect(result.drafts.find((draft) => draft.platformId === 'threads')?.body).toContain(
      '在符合条件时可能带来收益',
    );
  });
});
