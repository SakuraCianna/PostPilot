import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from './database';
import { createAccountRepository } from './accountRepository';

describe('account repository', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stores encrypted platform account fields and returns masked public configs', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-accounts-'));
    tempDirs.push(dir);
    const db = createDatabase(path.join(dir, 'postpilot.sqlite'));
    const repo = createAccountRepository(db, {
      encrypt: (value) => `enc:${value}`,
      decrypt: (value) => value.replace(/^enc:/, ''),
    });

    const saved = repo.saveAccountConfig({
      platformId: 'wechat',
      enabled: true,
      fields: {
        appId: 'wx1234567890',
        appSecret: 'secret-1234567890',
        thumbMediaId: 'media-123',
      },
    });
    const secret = repo.getSecretAccountConfig('wechat');

    expect(saved.configured).toBe(true);
    expect(saved.maskedFields.appSecret).toBe('sec*******90');
    expect(secret?.fields.appSecret).toBe('secret-1234567890');

    db.close();
  });

  it('deletes one platform account config', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-accounts-'));
    tempDirs.push(dir);
    const db = createDatabase(path.join(dir, 'postpilot.sqlite'));
    const repo = createAccountRepository(db, {
      encrypt: (value) => value,
      decrypt: (value) => value,
    });

    repo.saveAccountConfig({
      platformId: 'wechat',
      enabled: true,
      fields: {
        appId: 'wx123',
        appSecret: 'secret',
        thumbMediaId: 'media',
      },
    });
    repo.deleteAccountConfig('wechat');

    expect(repo.getSecretAccountConfig('wechat')).toBeNull();
    expect(repo.listAccountConfigs().find((item) => item.platformId === 'wechat')?.configured).toBe(
      false,
    );

    db.close();
  });

  it('keeps existing secret fields when a later save leaves them blank', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-accounts-'));
    tempDirs.push(dir);
    const db = createDatabase(path.join(dir, 'postpilot.sqlite'));
    const repo = createAccountRepository(db, {
      encrypt: (value) => value,
      decrypt: (value) => value,
    });

    repo.saveAccountConfig({
      platformId: 'wechat',
      enabled: true,
      fields: {
        appId: 'wx123',
        appSecret: 'secret',
        thumbMediaId: 'media',
      },
    });
    repo.saveAccountConfig({
      platformId: 'wechat',
      enabled: true,
      fields: {
        appId: 'wx456',
        appSecret: '',
        thumbMediaId: '',
      },
    });

    expect(repo.getSecretAccountConfig('wechat')?.fields).toEqual({
      appId: 'wx456',
      appSecret: 'secret',
      thumbMediaId: 'media',
    });

    db.close();
  });
});
