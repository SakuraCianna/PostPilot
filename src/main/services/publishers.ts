import {
  formatDraftForClipboard,
  getPlatformAdapter,
} from '../../shared/platformAdapters';
import type { PublishArtifact, PublishTaskInput, PublishTaskResult } from '../../shared/types';

export function createPublishTask(input: PublishTaskInput): PublishTaskResult {
  const adapter = getPlatformAdapter(input.draft.platformId);

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

  if (input.mode === 'simulated') {
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

  if (input.mode === 'exportOnly') {
    return {
      status: 'success',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'success',
        message: `${adapter.displayName} 导出内容已生成`,
      },
      artifact: createArtifact(input),
    };
  }

  if (input.mode === 'browserAssist') {
    return {
      status: 'pending',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'failed',
        message: `${adapter.displayName} 浏览器辅助发布尚未接入`,
      },
    };
  }

  return {
    status: 'pending',
    event: {
      platformId: input.draft.platformId,
      mode: input.mode,
      status: 'failed',
      message: `${adapter.displayName} 官方接口发布尚未接入`,
    },
  };
}

function createArtifact(input: PublishTaskInput): PublishArtifact {
  const adapter = getPlatformAdapter(input.draft.platformId);
  const extension = adapter.exportFormat === 'html' ? 'html' : 'md';

  return {
    filename: `${input.draft.platformId}-${Date.now()}.${extension}`,
    content: formatDraftForClipboard(input.draft),
    mimeType: adapter.exportFormat === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8',
  };
}
