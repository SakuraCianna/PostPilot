import { PLATFORM_ACCOUNT_SCHEMAS } from '../../shared/platformAccounts';
import type {
  BuiltInPlatformId,
  PlatformDraft,
  PlatformId,
  PublishReceipt,
  SecretPlatformAccountConfig,
  VerifyPlatformAccountResult,
} from '../../shared/types';

interface RetryOptions {
  attempts: number;
  delayMs: number;
}

interface VerifyAccountOptions {
  platformId: BuiltInPlatformId;
  account: SecretPlatformAccountConfig | null;
  fetchImpl?: typeof fetch;
}

interface PublishOfficialOptions {
  draft: PlatformDraft;
  account: SecretPlatformAccountConfig | null;
  fetchImpl?: typeof fetch;
  retry?: RetryOptions;
}

export interface OfficialPublishResult {
  status: 'success' | 'pending' | 'failed';
  message: string;
  attempts: number;
  receipt?: PublishReceipt;
}

const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  delayMs: 450,
};

export async function verifyOfficialAccount(
  options: VerifyAccountOptions,
): Promise<VerifyPlatformAccountResult> {
  const checkedAt = new Date().toISOString();
  const schema = PLATFORM_ACCOUNT_SCHEMAS[options.platformId];

  if (!options.account || !options.account.enabled) {
    return {
      platformId: options.platformId,
      status: 'auth-failed',
      message: `请先在设置中完成${schema.displayName}账号配置`,
      checkedAt,
    };
  }

  if (options.platformId !== 'wechat') {
    return {
      platformId: options.platformId,
      status: 'auth-failed',
      message: `${schema.displayName}暂未开放稳定的官方写入发布接口`,
      checkedAt,
    };
  }

  try {
    await getWechatAccessToken(options.account, options.fetchImpl ?? fetch);
    return {
      platformId: 'wechat',
      status: 'authorized',
      message: '微信公众号授权校验通过',
      checkedAt,
    };
  } catch (error) {
    return {
      platformId: 'wechat',
      status: 'auth-failed',
      message: error instanceof Error ? error.message : '微信公众号授权校验失败',
      checkedAt,
    };
  }
}

export async function publishWithOfficialConnector(
  options: PublishOfficialOptions,
): Promise<OfficialPublishResult> {
  const platformName = getOfficialPlatformName(options.draft.platformId);

  if (!options.account || !options.account.enabled) {
    return {
      status: 'failed',
      message: `请先在设置中完成${platformName}账号配置`,
      attempts: 0,
    };
  }

  if (options.draft.platformId !== 'wechat') {
    return {
      status: 'failed',
      message: getUnsupportedOfficialMessage(options.draft.platformId),
      attempts: 0,
    };
  }

  return publishWechat(options);
}

async function publishWechat(options: PublishOfficialOptions): Promise<OfficialPublishResult> {
  const retry = options.retry ?? DEFAULT_RETRY;
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = await getWechatAccessToken(options.account, fetchImpl);
  const result = await withRetry(
    () => createWechatDraft(options.draft, options.account, token, fetchImpl),
    retry,
  );

  if (options.account?.fields.publishTarget === 'publish') {
    const publishResult = await submitWechatPublish(result.value.draftId, token, fetchImpl);
    return {
      status: publishResult.publishId ? 'pending' : 'success',
      message: publishResult.publishId ? '微信公众号发布任务已提交' : '微信公众号草稿已创建',
      attempts: result.attempts,
      receipt: publishResult,
    };
  }

  return {
    status: 'success',
    message: '微信公众号草稿已创建',
    attempts: result.attempts,
    receipt: result.value,
  };
}

async function getWechatAccessToken(
  account: SecretPlatformAccountConfig | null,
  fetchImpl: typeof fetch,
): Promise<string> {
  const appId = account?.fields.appId?.trim();
  const appSecret = account?.fields.appSecret?.trim();

  if (!appId || !appSecret) {
    throw new Error('微信公众号缺少 AppID 或 AppSecret');
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);

  const payload = await readWechatJson(await fetchImpl(url));
  if (typeof payload.access_token !== 'string') {
    throw new Error(readWechatError(payload, '微信公众号授权校验失败'));
  }

  return payload.access_token;
}

async function createWechatDraft(
  draft: PlatformDraft,
  account: SecretPlatformAccountConfig | null,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<PublishReceipt> {
  const thumbMediaId = account?.fields.thumbMediaId?.trim();
  if (!thumbMediaId) {
    throw new Error('微信公众号缺少封面素材 Media ID');
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/draft/add');
  url.searchParams.set('access_token', accessToken);

  const payload = await readWechatJson(
    await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        articles: [
          {
            article_type: 'news',
            title: draft.title,
            author: account?.fields.author ?? '',
            digest: draft.summary,
            content: draft.body,
            content_source_url: account?.fields.sourceUrl ?? '',
            thumb_media_id: thumbMediaId,
            need_open_comment: 1,
            only_fans_can_comment: 0,
          },
        ],
      }),
    }),
  );

  if (typeof payload.media_id !== 'string') {
    throw new Error(readWechatError(payload, '微信公众号草稿创建失败'));
  }

  return {
    provider: 'wechat',
    draftId: payload.media_id,
    externalId: payload.media_id,
    raw: payload,
    checkedAt: new Date().toISOString(),
  };
}

async function submitWechatPublish(
  mediaId: string | undefined,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<PublishReceipt> {
  if (!mediaId) {
    throw new Error('微信公众号草稿回执缺少 Media ID');
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/freepublish/submit');
  url.searchParams.set('access_token', accessToken);
  const payload = await readWechatJson(
    await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ media_id: mediaId }),
    }),
  );

  if (payload.errcode && payload.errcode !== 0) {
    throw new Error(readWechatError(payload, '微信公众号发布任务提交失败'));
  }

  return {
    provider: 'wechat',
    draftId: mediaId,
    publishId: typeof payload.publish_id === 'string' ? payload.publish_id : undefined,
    externalId: typeof payload.publish_id === 'string' ? payload.publish_id : mediaId,
    raw: payload,
    checkedAt: new Date().toISOString(),
  };
}

async function withRetry<T>(
  action: () => Promise<T>,
  retry: RetryOptions,
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
    try {
      return {
        value: await action(),
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retry.attempts) {
        await wait(retry.delayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('发布任务重试失败');
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function readWechatJson(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(readWechatError(payload, `微信公众号接口请求失败, HTTP 状态码 ${response.status}`));
  }
  if (typeof payload.errcode === 'number' && payload.errcode !== 0) {
    throw new Error(readWechatError(payload, '微信公众号接口返回失败'));
  }
  return payload;
}

function readWechatError(payload: Record<string, unknown>, fallback: string): string {
  const errcode = typeof payload.errcode === 'number' ? `错误码 ${payload.errcode}` : '';
  const errmsg = typeof payload.errmsg === 'string' ? payload.errmsg : '';
  return [fallback, errcode, errmsg].filter(Boolean).join(', ');
}

function getUnsupportedOfficialMessage(platformId: PlatformId): string {
  const messages: Record<string, string> = {
    wechat: '微信公众号官方发布接口不可用',
    zhihu: '知乎暂未开放稳定的官方写入发布接口',
    bilibili: 'B 站官方发布需要视频稿件文件和授权, 当前文本草稿无法直接发布',
    xiaohongshu: '小红书暂未开放稳定的普通笔记官方写入发布接口',
  };
  return messages[platformId] ?? `${platformId}暂未接入官方发布接口`;
}

function getOfficialPlatformName(platformId: PlatformId): string {
  const schema = PLATFORM_ACCOUNT_SCHEMAS[platformId as BuiltInPlatformId];
  return schema?.displayName ?? platformId;
}
