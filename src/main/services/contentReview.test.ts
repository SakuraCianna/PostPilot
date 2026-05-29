import { describe, expect, it } from 'vitest';
import { DEEPSEEK_MODEL, type PlatformDraft } from '../../shared/types';
import { reviewContentSafety } from './contentReview';

const drafts: PlatformDraft[] = [
  {
    platformId: 'wechat',
    title: '发布说明',
    summary: '产品更新',
    body: '<p>这是一段普通正文。</p>',
    hashtags: [],
    status: 'ready',
  },
];

describe('content review service', () => {
  it('uses local risk rules when no API key is configured', async () => {
    const result = await reviewContentSafety({
      content: {
        title: '收益承诺',
        body: '这个方案保证收益, 适合所有人。',
      },
      drafts,
      apiKey: '',
    });

    expect(result.model).toBe(DEEPSEEK_MODEL);
    expect(result.modelStatus).toBe('local-fallback');
    expect(result.status).toBe('blocked');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        kind: 'legal',
        snippet: '保证收益',
      }),
    );
  });

  it('requests DeepSeek JSON review and recomputes status from issues', async () => {
    const calls: unknown[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  issues: [
                    {
                      kind: 'values',
                      platformId: 'wechat',
                      snippet: '低端用户',
                      reason: '可能带有贬损表达',
                      suggestion: '改成更中性的用户分层描述',
                      confidence: 'medium',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );
    };

    const result = await reviewContentSafety({
      content: {
        title: '用户分析',
        body: '低端用户也需要被看见。',
      },
      drafts,
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect((calls[0] as { model: string }).model).toBe(DEEPSEEK_MODEL);
    expect((calls[0] as { response_format: { type: string } }).response_format.type).toBe(
      'json_object',
    );
    expect(result.modelStatus).toBe('ai');
    expect(result.status).toBe('needs-attention');
    expect(result.issues[0]).toMatchObject({
      kind: 'values',
      platformId: 'wechat',
      snippet: '低端用户',
    });
  });
});
