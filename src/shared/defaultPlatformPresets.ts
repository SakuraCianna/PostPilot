import type { BuiltInPlatformId } from './types';
import wechatPreset from './platformPresets/wechat.md?raw';
import bilibiliPreset from './platformPresets/bilibili.md?raw';
import douyinPreset from './platformPresets/douyin.md?raw';

export const DEFAULT_PLATFORM_PRESETS: Record<BuiltInPlatformId, string> = {
  wechat: wechatPreset,
  bilibili: bilibiliPreset,
  douyin: douyinPreset,
};
