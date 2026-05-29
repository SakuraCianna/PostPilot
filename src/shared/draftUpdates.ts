import { normalizeDraft } from './platformAdapters';
import type { PlatformDraft } from './types';

export function replacePlatformDraft(
  drafts: PlatformDraft[],
  nextDraft: PlatformDraft,
): PlatformDraft[] {
  const index = drafts.findIndex((draft) => draft.platformId === nextDraft.platformId);
  if (index < 0) {
    throw new Error('未找到要更新的平台草稿');
  }

  return drafts.map((draft, draftIndex) =>
    draftIndex === index ? normalizeDraft(nextDraft) : draft,
  );
}
