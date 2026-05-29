import type {
  PlatformAccountConfig,
  PlatformDraft,
  PublishEvent,
} from '../shared/types';

export type ProductStatusState = 'done' | 'blocked' | 'failed' | 'idle';

export interface ReadinessStep {
  id: 'review' | 'account' | 'receipt';
  label: string;
  state: ProductStatusState;
  text: string;
}

export function createReadinessSteps(input: {
  draft: PlatformDraft;
  account: PlatformAccountConfig | null;
  publishEvents: PublishEvent[];
}): ReadinessStep[] {
  return [
    {
      id: 'review',
      label: '审核',
      state: input.draft.status === 'ready' ? 'done' : 'blocked',
      text: input.draft.status === 'ready' ? '已审核' : '待审核',
    },
    {
      id: 'account',
      label: '账号',
      ...getAccountDisplayState(input.account),
    },
    {
      id: 'receipt',
      label: '回执',
      ...getPublishEventState(input.publishEvents),
    },
  ];
}

export function getAccountDisplayState(
  account: PlatformAccountConfig | null,
): Pick<ReadinessStep, 'state' | 'text'> {
  if (!account || !account.configured || !account.enabled) {
    return {
      state: 'blocked',
      text: '未配置',
    };
  }

  if (account.status === 'authorized') {
    return {
      state: 'done',
      text: '已授权',
    };
  }

  if (account.status === 'auth-failed') {
    return {
      state: 'failed',
      text: '授权失败',
    };
  }

  return {
    state: 'idle',
    text: '待授权',
  };
}

export function getPublishEventState(
  publishEvents: PublishEvent[],
): Pick<ReadinessStep, 'state' | 'text'> {
  const latest = publishEvents[0];
  if (!latest) {
    return {
      state: 'idle',
      text: '暂无回执',
    };
  }

  if (latest.status === 'success') {
    return {
      state: 'done',
      text: '发布成功',
    };
  }

  if (latest.status === 'pending') {
    return {
      state: 'idle',
      text: '发布中',
    };
  }

  return {
    state: 'failed',
    text: '发布失败',
  };
}
