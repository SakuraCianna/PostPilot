import type {
  PlatformAccountConfig,
  PlatformAdapter,
  PlatformId,
  SavedSession,
} from '../shared/types';

export type PublishReadinessState = 'done' | 'blocked' | 'warning';

export interface PublishReadinessItem {
  id: 'drafts' | 'content-review' | 'account-auth' | 'platform-coverage';
  label: string;
  state: PublishReadinessState;
  detail: string;
  action: string;
}

export interface PublishReadiness {
  canRunPublishAll: boolean;
  publishablePlatformIds: PlatformId[];
  blockedCount: number;
  warningCount: number;
  items: PublishReadinessItem[];
}

export function createPublishReadiness(input: {
  session: SavedSession | null;
  adapters: PlatformAdapter[];
  accounts: PlatformAccountConfig[];
}): PublishReadiness {
  const officialAdapters = input.adapters.filter((adapter) =>
    adapter.publishModes.includes('officialApi'),
  );
  const publishablePlatformIds = officialAdapters.map((adapter) => adapter.id);
  const items = [
    createDraftsItem(input.session, input.adapters.length),
    createContentReviewItem(input.session),
    createAccountAuthItem(input.accounts, officialAdapters),
    createPlatformCoverageItem(input.adapters, officialAdapters),
  ];
  const blockedCount = items.filter((item) => item.state === 'blocked').length;
  const warningCount = items.filter((item) => item.state === 'warning').length;

  return {
    canRunPublishAll: blockedCount === 0 && publishablePlatformIds.length > 0,
    publishablePlatformIds,
    blockedCount,
    warningCount,
    items,
  };
}

function createDraftsItem(
  session: SavedSession | null,
  adapterCount: number,
): PublishReadinessItem {
  const draftCount = session?.drafts.length ?? 0;
  if (!session || draftCount === 0) {
    return {
      id: 'drafts',
      label: '平台版本',
      state: 'blocked',
      detail: '还没有平台版本',
      action: '先生成平台版本',
    };
  }

  if (draftCount < adapterCount) {
    return {
      id: 'drafts',
      label: '平台版本',
      state: 'blocked',
      detail: `已生成 ${draftCount}/${adapterCount}`,
      action: '重新生成平台版本',
    };
  }

  return {
    id: 'drafts',
    label: '平台版本',
    state: 'done',
    detail: `已生成 ${draftCount}/${adapterCount}`,
    action: '可以进入发布检查',
  };
}

function createContentReviewItem(session: SavedSession | null): PublishReadinessItem {
  const review = session?.contentReview;
  if (!review) {
    return {
      id: 'content-review',
      label: '内容审查',
      state: 'blocked',
      detail: '缺少发布前审查',
      action: '先运行 AI 审查',
    };
  }

  if (review.status === 'blocked') {
    return {
      id: 'content-review',
      label: '内容审查',
      state: 'blocked',
      detail: '存在法律风险',
      action: '先优化风险表达',
    };
  }

  if (review.status === 'needs-attention') {
    return {
      id: 'content-review',
      label: '内容审查',
      state: 'warning',
      detail: '存在价值观风险提示',
      action: '发布前请关注',
    };
  }

  return {
    id: 'content-review',
    label: '内容审查',
    state: 'done',
    detail: '未发现明显风险',
    action: '可以发布',
  };
}

function createAccountAuthItem(
  accounts: PlatformAccountConfig[],
  officialAdapters: PlatformAdapter[],
): PublishReadinessItem {
  const missing = officialAdapters.filter((adapter) => {
    const account = accounts.find((item) => item.platformId === adapter.id);
    return !account || !account.enabled || account.status !== 'authorized';
  });

  if (missing.length > 0) {
    return {
      id: 'account-auth',
      label: '账号授权',
      state: 'blocked',
      detail: missing.map((adapter) => `${adapter.displayName}待授权`).join(', '),
      action: '到设置中完成授权',
    };
  }

  return {
    id: 'account-auth',
    label: '账号授权',
    state: 'done',
    detail: '官方接口账号已授权',
    action: '可以发布',
  };
}

function createPlatformCoverageItem(
  adapters: PlatformAdapter[],
  officialAdapters: PlatformAdapter[],
): PublishReadinessItem {
  const unsupported = adapters.filter((adapter) => !officialAdapters.includes(adapter));
  if (unsupported.length > 0) {
    return {
      id: 'platform-coverage',
      label: '平台覆盖',
      state: 'warning',
      detail: `${unsupported.map((adapter) => adapter.displayName).join(', ')}需要导出或浏览器辅助`,
      action: '官方接口仅发布已接入平台',
    };
  }

  return {
    id: 'platform-coverage',
    label: '平台覆盖',
    state: 'done',
    detail: '所有平台支持官方接口',
    action: '可以一键发布',
  };
}
