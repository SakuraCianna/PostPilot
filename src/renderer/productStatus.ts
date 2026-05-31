import type {
  ContentReviewResult,
  PlatformDraft,
  PublishEvent,
} from '../shared/types';

export type ProductStatusState = 'done' | 'blocked' | 'failed' | 'idle' | 'warning';

export interface ReadinessStep {
  id: 'draft' | 'content' | 'simulation' | 'result';
  label: string;
  state: ProductStatusState;
  text: string;
}

export function createReadinessSteps(input: {
  draft: PlatformDraft;
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
      id: 'simulation',
      label: '发布',
      state: 'done',
      text: '模拟模式',
    },
    {
      id: 'result',
      label: '结果',
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

export function getPublishEventState(
  publishEvents: PublishEvent[],
): Pick<ReadinessStep, 'state' | 'text'> {
  const latest = publishEvents[0];
  if (!latest) {
    return {
      state: 'idle',
      text: '暂无结果',
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
