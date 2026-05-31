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
      'douyin',
      'kuaishou',
      'weibo',
      'toutiao',
      'baijiahao',
    ]);
  });

  it('does not require account secrets in simulation-only mode', () => {
    const result = validateAccountFields('wechat', {
      styleNote: '',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('masks secret-like platform config fields before returning them to renderer', () => {
    const masked = maskAccountFields('wechat', {
      styleNote: '保持专业',
      accessToken: 'token-1234567890',
    });

    expect(masked.styleNote).toBe('保持专业');
    expect(masked.accessToken).toBeUndefined();
  });
});
