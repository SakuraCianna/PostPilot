import { getPlatformAdapter } from '../../shared/platformAdapters';
import type {
  PlatformAdapter,
  PublishTaskInput,
  PublishTaskResult,
} from '../../shared/types';

export interface PublishTaskContext {
  adapters?: PlatformAdapter[];
}

export async function createPublishTask(
  input: PublishTaskInput,
  context: PublishTaskContext = {},
): Promise<PublishTaskResult> {
  const adapter = getPlatformAdapter(input.draft.platformId, context.adapters);

  if (!adapter.publishModes.includes(input.mode)) {
    return {
      status: 'failed',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'failed',
        message: `${adapter.displayName} 不支持当前发布方式`,
      },
    };
  }

  if (input.contentReview?.status === 'blocked') {
    return {
      status: 'failed',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'failed',
        message: '内容法律风险未处理, 已拦截模拟发布',
      },
    };
  }

  return {
    status: 'success',
    event: {
      platformId: input.draft.platformId,
      mode: input.mode,
      status: 'success',
      message: `${adapter.displayName} 模拟发布已完成`,
    },
  };
}
