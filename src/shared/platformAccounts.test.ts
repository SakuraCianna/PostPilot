import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ACCOUNT_SCHEMAS,
  maskAccountFields,
  validateAccountFields,
} from './platformAccounts';

describe('platform account schemas', () => {
  it('defines account fields for every supported platform', () => {
    expect(Object.keys(PLATFORM_ACCOUNT_SCHEMAS)).toEqual([
      'wechat',
      'zhihu',
      'bilibili',
      'xiaohongshu',
    ]);
  });

  it('validates required fields with Chinese messages', () => {
    const result = validateAccountFields('wechat', {
      appId: 'wx123',
      appSecret: '',
      thumbMediaId: '',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('微信公众号缺少 AppSecret');
    expect(result.errors).toContain('微信公众号缺少封面素材 Media ID');
  });

  it('masks secret account fields before returning them to renderer', () => {
    const masked = maskAccountFields('wechat', {
      appId: 'wx1234567890',
      appSecret: 'secret-1234567890',
      thumbMediaId: 'media-123',
    });

    expect(masked.appId).toBe('wx1*******90');
    expect(masked.appSecret).toBe('sec*******90');
    expect(masked.thumbMediaId).toBe('media-123');
  });
});
