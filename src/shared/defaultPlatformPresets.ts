import type { BuiltInPlatformId } from './types';
import wechatPreset from '../../platform-presets/wechat.md?raw';
import bilibiliPreset from '../../platform-presets/bilibili.md?raw';
import douyinPreset from '../../platform-presets/douyin.md?raw';

export const DEFAULT_PLATFORM_PRESETS: Record<BuiltInPlatformId, string> = {
  wechat: wechatPreset,
  bilibili: bilibiliPreset,
  douyin: douyinPreset,
};
