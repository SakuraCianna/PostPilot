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
        styleNote: '保持专业, 结构清晰',
      },
    });
    const secret = repo.getSecretAccountConfig('wechat');

    expect(saved.configured).toBe(true);
    expect(saved.maskedFields.styleNote).toBe('保持专业, 结构清晰');
    expect(secret?.fields.styleNote).toBe('保持专业, 结构清晰');

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
        styleNote: '公众号风格',
      },
    });
    repo.deleteAccountConfig('wechat');

    expect(repo.getSecretAccountConfig('wechat')).toBeNull();
    expect(repo.listAccountConfigs().find((item) => item.platformId === 'wechat')?.configured).toBe(
      false,
    );

    db.close();
  });

  it('keeps existing platform fields when a later save leaves them blank', () => {
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
        styleNote: '公众号风格',
      },
    });
    repo.saveAccountConfig({
      platformId: 'wechat',
      enabled: true,
      fields: {
        styleNote: '',
      },
    });

    expect(repo.getSecretAccountConfig('wechat')?.fields).toEqual({
      styleNote: '公众号风格',
    });

    db.close();
  });

  it('stores custom platform account configs outside built-in schemas', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-accounts-'));
    tempDirs.push(dir);
    const db = createDatabase(path.join(dir, 'postpilot.sqlite'));
    const repo = createAccountRepository(db, {
      encrypt: (value) => value,
      decrypt: (value) => value,
    });

    const saved = repo.saveAccountConfig({
      platformId: 'threads',
      displayName: 'Threads',
      enabled: true,
      fields: {
        accessToken: 'token-123456',
        workspaceId: 'space-1',
      },
    });

    expect(saved).toMatchObject({
      platformId: 'threads',
      displayName: 'Threads',
      builtIn: false,
      configured: true,
    });
    expect(saved.maskedFields.accessToken).toBe('tok*******56');
    expect(repo.listAccountConfigs().some((config) => config.platformId === 'threads')).toBe(true);
    expect(repo.getSecretAccountConfig('threads')?.fields.workspaceId).toBe('space-1');

    db.close();
  });
});
