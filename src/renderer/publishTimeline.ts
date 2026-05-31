import type {
  PlatformAdapter,
  PlatformId,
  PublishEvent,
  PublishMode,
  SavedSession,
} from '../shared/types';

export type PublishTimelineStatus = 'success' | 'failed' | 'pending' | 'ready' | 'blocked';

export interface PublishTimelineItem {
  platformId: PlatformId;
  platformName: string;
  status: PublishTimelineStatus;
  label: string;
  message: string;
  mode: PublishMode;
  attempts: number;
  canRetry: boolean;
  updatedAt?: string;
}

export interface PublishTimelineSummary {
  total: number;
  success: number;
  failed: number;
  pending: number;
  ready: number;
  blocked: number;
  progress: number;
}

export interface PublishTimeline {
  items: PublishTimelineItem[];
  summary: PublishTimelineSummary;
}

export function createPublishTimeline(input: {
  session: SavedSession | null;
  adapters: PlatformAdapter[];
}): PublishTimeline {
  const items = input.adapters.map((adapter) => {
    const draft = input.session?.drafts.find((item) => item.platformId === adapter.id);
    const latestEvent = getLatestPlatformEvent(
      input.session?.publishEvents ?? [],
      adapter.id,
    );

    if (latestEvent) {
      return createEventItem(adapter, latestEvent, Boolean(draft));
    }

    if (!draft) {
      return {
        platformId: adapter.id,
        platformName: adapter.displayName,
        status: 'blocked',
        label: '待准备',
        message: '等待生成平台版本',
        mode: getPrimaryPublishMode(adapter),
        attempts: 0,
        canRetry: false,
      } satisfies PublishTimelineItem;
    }

    return {
      platformId: adapter.id,
      platformName: adapter.displayName,
      status: 'ready',
      label: '可发布',
      message: '等待发布任务',
      mode: getPrimaryPublishMode(adapter),
      attempts: 0,
      canRetry: false,
    } satisfies PublishTimelineItem;
  });

  return {
    items,
    summary: createSummary(items),
  };
}

function createEventItem(
  adapter: PlatformAdapter,
  event: PublishEvent,
  draftReady: boolean,
): PublishTimelineItem {
  return {
    platformId: adapter.id,
    platformName: adapter.displayName,
    status: event.status,
    label: getEventLabel(event.status),
    message: event.message,
    mode: event.mode,
    attempts: event.attempts ?? 1,
    canRetry: event.status === 'failed' && event.mode !== 'exportOnly' && draftReady,
    updatedAt: event.createdAt,
  };
}

function createSummary(items: PublishTimelineItem[]): PublishTimelineSummary {
  const total = items.length;
  const success = countByStatus(items, 'success');
  return {
    total,
    success,
    failed: countByStatus(items, 'failed'),
    pending: countByStatus(items, 'pending'),
    ready: countByStatus(items, 'ready'),
    blocked: countByStatus(items, 'blocked'),
    progress: total === 0 ? 0 : Math.round((success / total) * 100),
  };
}

function countByStatus(items: PublishTimelineItem[], status: PublishTimelineStatus): number {
  return items.filter((item) => item.status === status).length;
}

function getLatestPlatformEvent(
  events: PublishEvent[],
  platformId: PlatformId,
): PublishEvent | undefined {
  return events
    .filter((event) => event.platformId === platformId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

function getPrimaryPublishMode(adapter: PlatformAdapter): PublishMode {
  if (adapter.publishModes.includes('officialApi')) {
    return 'officialApi';
  }
  if (adapter.publishModes.includes('browserAssist')) {
    return 'browserAssist';
  }
  if (adapter.publishModes.includes('exportOnly')) {
    return 'exportOnly';
  }
  return 'simulated';
}

function getEventLabel(status: PublishEvent['status']): string {
  if (status === 'success') {
    return '已完成';
  }
  if (status === 'pending') {
    return '进行中';
  }
  return '失败';
}
