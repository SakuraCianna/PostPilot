import type {
  ContentReviewResult,
  PlatformAccountConfig,
  PlatformDraft,
  PublishEvent,
} from '../shared/types';

export type ProductStatusState = 'done' | 'blocked' | 'failed' | 'idle' | 'warning';

export interface ReadinessStep {
  id: 'draft' | 'content' | 'account' | 'receipt';
  label: string;
  state: ProductStatusState;
  text: string;
}

export function createReadinessSteps(input: {
  draft: PlatformDraft;
  account: PlatformAccountConfig | null;
  contentReview?: ContentReviewResult | null;
  publishEvents: PublishEvent[];
}): ReadinessStep[] {
  return [
    {
      id: 'draft',
      label: '草稿',
      state: input.draft.warnings?.length ? 'warning' : 'done',
      text: input.draft.warnings?.length ? '需修正' : '已生成',
    },
    {
      id: 'content',
      label: '审查',
      ...getContentReviewDisplayState(input.contentReview ?? null),
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

export function getContentReviewDisplayState(
  review: ContentReviewResult | null,
): Pick<ReadinessStep, 'state' | 'text'> {
  if (!review) {
    return {
      state: 'blocked',
      text: '待审查',
    };
  }

  if (review.status === 'passed') {
    return {
      state: 'done',
      text: '已通过',
    };
  }

  if (review.status === 'blocked') {
    return {
      state: 'failed',
      text: '已拦截',
    };
  }

  return {
    state: 'warning',
    text: '需关注',
  };
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
