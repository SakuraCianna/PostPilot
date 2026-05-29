import { describe, expect, it } from 'vitest';
import { publishWithOfficialConnector, verifyOfficialAccount } from './officialConnectors';
import type { SecretPlatformAccountConfig } from '../../shared/types';

const wechatAccount: SecretPlatformAccountConfig = {
  platformId: 'wechat',
  enabled: true,
  fields: {
    appId: 'wx123',
    appSecret: 'secret',
    thumbMediaId: 'thumb-media',
    author: '作者',
    publishTarget: 'draft',
  },
};

describe('official connectors', () => {
  it('verifies WeChat credentials by requesting an access token', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 }));
    };

    const result = await verifyOfficialAccount({
      platformId: 'wechat',
      account: wechatAccount,
      fetchImpl,
    });

    expect(result.status).toBe('authorized');
    expect(result.message).toBe('微信公众号授权校验通过');
    expect(calls[0]).toContain('/cgi-bin/token');
  });

  it('publishes a WeChat draft and returns a receipt', async () => {
    const bodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      if (String(url).includes('/cgi-bin/token')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 }));
      }
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ media_id: 'draft-media-id' }));
    };

    const result = await publishWithOfficialConnector({
      draft: {
        platformId: 'wechat',
        title: '标题',
        summary: '摘要',
        body: '<p>正文</p>',
        hashtags: [],
        status: 'ready',
      },
      account: wechatAccount,
      fetchImpl,
    });

    expect(result.status).toBe('success');
    expect(result.receipt?.draftId).toBe('draft-media-id');
    expect(result.message).toBe('微信公众号草稿已创建');
    expect(bodies[0]).toMatchObject({
      articles: [
        {
          title: '标题',
          digest: '摘要',
          content: '<p>正文</p>',
          thumb_media_id: 'thumb-media',
        },
      ],
    });
  });

  it('retries transient WeChat publishing failures before returning receipt', async () => {
    let attempts = 0;
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).includes('/cgi-bin/token')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 }));
      }
      attempts += 1;
      if (attempts < 3) {
        return new Response(JSON.stringify({ errcode: -1, errmsg: 'system busy' }), {
          status: 500,
        });
      }
      return new Response(JSON.stringify({ media_id: 'draft-media-id' }));
    };

    const result = await publishWithOfficialConnector({
      draft: {
        platformId: 'wechat',
        title: '标题',
        summary: '摘要',
        body: '<p>正文</p>',
        hashtags: [],
        status: 'ready',
      },
      account: wechatAccount,
      fetchImpl,
      retry: {
        attempts: 3,
        delayMs: 1,
      },
    });

    expect(result.status).toBe('success');
    expect(result.attempts).toBe(3);
    expect(attempts).toBe(3);
  });

  it('reports unsupported official writing capability in Chinese', async () => {
    const result = await publishWithOfficialConnector({
      draft: {
        platformId: 'zhihu',
        title: '标题',
        summary: '摘要',
        body: '正文',
        hashtags: [],
        status: 'ready',
      },
      account: {
        platformId: 'zhihu',
        enabled: true,
        fields: { accessToken: 'token' },
      },
    });

    expect(result.status).toBe('failed');
    expect(result.message).toBe('知乎暂未开放稳定的官方写入发布接口');
  });
});
