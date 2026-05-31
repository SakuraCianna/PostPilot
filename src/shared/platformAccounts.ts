import type {
  BuiltInPlatformId,
  PlatformAccountConfig,
  PlatformAccountSchema,
  PlatformAccountStatus,
} from './types';

export const CUSTOM_PLATFORM_NAME_FIELD = '__platformName';

export const PLATFORM_ACCOUNT_SCHEMAS: Record<BuiltInPlatformId, PlatformAccountSchema> = {
  wechat: {
    platformId: 'wechat',
    displayName: '微信公众号',
    supportsOfficialApi: true,
    fields: [
      { key: 'appId', label: 'AppID', required: true },
      { key: 'appSecret', label: 'AppSecret', required: true, secret: true, kind: 'password' },
      { key: 'thumbMediaId', label: '封面素材 Media ID', required: true },
      { key: 'author', label: '作者', required: false },
      { key: 'sourceUrl', label: '原文链接', required: false },
      {
        key: 'publishTarget',
        label: '发布目标',
        required: false,
        kind: 'select',
        options: [
          { label: '保存草稿', value: 'draft' },
          { label: '提交发布', value: 'publish' },
        ],
      },
    ],
  },
  zhihu: {
    platformId: 'zhihu',
    displayName: '知乎',
    supportsOfficialApi: false,
    fields: [{ key: 'accessToken', label: 'Access Token', required: false, secret: true }],
  },
  bilibili: {
    platformId: 'bilibili',
    displayName: 'B 站',
    supportsOfficialApi: false,
    fields: [
      { key: 'clientId', label: 'Client ID', required: false },
      { key: 'clientSecret', label: 'Client Secret', required: false, secret: true },
      { key: 'accessToken', label: 'Access Token', required: false, secret: true },
      { key: 'refreshToken', label: 'Refresh Token', required: false, secret: true },
    ],
  },
  xiaohongshu: {
    platformId: 'xiaohongshu',
    displayName: '小红书',
    supportsOfficialApi: false,
    fields: [
      { key: 'appKey', label: 'App Key', required: false },
      { key: 'appSecret', label: 'App Secret', required: false, secret: true },
      { key: 'accessToken', label: 'Access Token', required: false, secret: true },
    ],
  },
};

export function validateAccountFields(
  platformId: string,
  fields: Record<string, string>,
): {
  valid: boolean;
  errors: string[];
} {
  if (!isBuiltInPlatformId(platformId)) {
    return {
      valid: true,
      errors: [],
    };
  }

  const schema = PLATFORM_ACCOUNT_SCHEMAS[platformId];
  const errors = schema.fields
    .filter((field) => field.required && !fields[field.key]?.trim())
    .map((field) => `${schema.displayName}缺少${formatFieldLabelForMessage(field.label)}`);

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function maskAccountFields(
  platformId: string,
  fields: Record<string, string>,
): Record<string, string> {
  if (!isBuiltInPlatformId(platformId)) {
    return Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => key !== CUSTOM_PLATFORM_NAME_FIELD)
        .map(([key, value]) => [key, shouldMaskField(key, false) ? maskSecret(value) : value]),
    );
  }

  const schema = PLATFORM_ACCOUNT_SCHEMAS[platformId];
  return Object.fromEntries(
    schema.fields
      .filter((field) => fields[field.key])
      .map((field) => [
        field.key,
        shouldMaskField(field.key, Boolean(field.secret))
          ? maskSecret(fields[field.key] ?? '')
          : fields[field.key] ?? '',
      ]),
  );
}

export function createEmptyAccountConfig(platformId: BuiltInPlatformId): PlatformAccountConfig {
  return {
    platformId,
    displayName: PLATFORM_ACCOUNT_SCHEMAS[platformId].displayName,
    builtIn: true,
    enabled: false,
    configured: false,
    status: 'not-configured',
    statusMessage: '未配置账号',
    maskedFields: {},
  };
}

export function isBuiltInPlatformId(platformId: string): platformId is BuiltInPlatformId {
  return Object.hasOwn(PLATFORM_ACCOUNT_SCHEMAS, platformId);
}

export function accountStatusMessage(status: PlatformAccountStatus): string {
  const messages: Record<PlatformAccountStatus, string> = {
    'not-configured': '未配置账号',
    configured: '账号配置已保存',
    authorized: '授权校验通过',
    'auth-failed': '授权校验失败',
  };
  return messages[status];
}

function formatFieldLabelForMessage(label: string): string {
  return /^[A-Za-z]/.test(label) ? ` ${label}` : label;
}

function shouldMaskField(key: string, secret: boolean): boolean {
  const normalizedKey = key.toLowerCase();
  return (
    secret ||
    ['appid', 'clientid', 'appkey'].includes(normalizedKey) ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('token') ||
    normalizedKey.includes('key')
  );
}

function maskSecret(value: string): string {
  if (!value) {
    return '';
  }
  if (value.length <= 6) {
    return `${value.slice(0, 2)}****`;
  }
  return `${value.slice(0, 3)}${'*'.repeat(7)}${value.slice(-2)}`;
}
