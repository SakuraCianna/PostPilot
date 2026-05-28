import { describe, expect, it } from 'vitest';
import { DEEPSEEK_MODEL } from '../../shared/types';
import { generateAdaptations } from './deepseek';

describe('deepseek adaptation service', () => {
  it('uses local drafts when no API key is configured', async () => {
    const result = await generateAdaptations({
      content: {
        title: 'Creator workflow',
        body: 'Write once and adapt everywhere.',
      },
      apiKey: '',
    });

    expect(result.model).toBe(DEEPSEEK_MODEL);
    expect(result.modelStatus).toBe('local-fallback');
    expect(result.drafts).toHaveLength(4);
  });

  it('requests deepseek-v4-flash and fills missing platforms from local drafts', async () => {
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
                      title: 'AI title',
                      summary: 'AI summary',
                      body: '<p>AI body</p>',
                      hashtags: [],
                      status: 'ready',
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    const result = await generateAdaptations({
      content: {
        title: 'Creator workflow',
        body: 'Write once and adapt everywhere.',
      },
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect((calls[0] as { model: string }).model).toBe(DEEPSEEK_MODEL);
    expect(result.modelStatus).toBe('ai');
    expect(result.drafts).toHaveLength(4);
    expect(result.drafts[0]?.title).toBe('AI title');
  });
});
