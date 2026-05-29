import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from './database';
import { createSettingsRepository } from './settingsRepository';

describe('settings repository', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stores DeepSeek settings with encrypted API key and public masking', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-settings-'));
    tempDirs.push(dir);
    const db = createDatabase(path.join(dir, 'postpilot.sqlite'));
    const repo = createSettingsRepository(db, {
      encrypt: (value) => `enc:${value}`,
      decrypt: (value) => value.replace(/^enc:/, ''),
    });

    const saved = repo.saveModelSettings({
      apiKey: 'sk-1234567890',
      baseUrl: 'https://api.deepseek.com',
    });
    const secret = repo.getDeepSeekSecret();

    expect(saved).toEqual({
      model: 'deepseek-v4-flash',
      baseUrl: 'https://api.deepseek.com',
      apiKeyConfigured: true,
      maskedApiKey: 'sk-*******90',
    });
    expect(secret).toEqual({
      apiKey: 'sk-1234567890',
      baseUrl: 'https://api.deepseek.com',
    });

    db.close();
  });

  it('clears API key when an empty value is saved', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-settings-'));
    tempDirs.push(dir);
    const db = createDatabase(path.join(dir, 'postpilot.sqlite'));
    const repo = createSettingsRepository(db, {
      encrypt: (value) => `enc:${value}`,
      decrypt: (value) => value.replace(/^enc:/, ''),
    });

    repo.saveModelSettings({
      apiKey: 'sk-1234567890',
      baseUrl: 'https://api.deepseek.com',
    });
    const cleared = repo.saveModelSettings({
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
    });

    expect(cleared.apiKeyConfigured).toBe(false);
    expect(repo.getDeepSeekSecret().apiKey).toBe('');

    db.close();
  });
});
