import {
  DEEPSEEK_MODEL,
  type DeepSeekSecret,
  type ModelSettings,
  type SaveModelSettingsInput,
} from '../../shared/types';
import type { PostPilotDatabase } from './database';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const BASE_URL_KEY = 'deepseek.baseUrl';
const API_KEY_KEY = 'deepseek.apiKey';

export interface SecretCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export function createSettingsRepository(db: PostPilotDatabase, codec: SecretCodec) {
  function getSetting(key: string): string | null {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | Pick<SettingRow, 'value'>
      | undefined;
    return row?.value ?? null;
  }

  function setSetting(key: string, value: string): void {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, new Date().toISOString());
  }

  function deleteSetting(key: string): void {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  function getBaseUrl(): string {
    return getSetting(BASE_URL_KEY) ?? DEFAULT_BASE_URL;
  }

  function getApiKey(): string {
    const encrypted = getSetting(API_KEY_KEY);
    return encrypted ? codec.decrypt(encrypted) : '';
  }

  return {
    getModelSettings(): ModelSettings {
      const apiKey = getApiKey();
      return {
        model: DEEPSEEK_MODEL,
        baseUrl: getBaseUrl(),
        apiKeyConfigured: apiKey.length > 0,
        maskedApiKey: maskApiKey(apiKey),
      };
    },

    getDeepSeekSecret(): DeepSeekSecret {
      return {
        apiKey: getApiKey(),
        baseUrl: getBaseUrl(),
      };
    },

    saveModelSettings(input: SaveModelSettingsInput): ModelSettings {
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      setSetting(BASE_URL_KEY, baseUrl);

      if (input.apiKey !== undefined) {
        const apiKey = input.apiKey.trim();
        if (apiKey) {
          setSetting(API_KEY_KEY, codec.encrypt(apiKey));
        } else {
          deleteSetting(API_KEY_KEY);
        }
      }

      return this.getModelSettings();
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(trimmed)) {
    throw new Error('DeepSeek API 地址必须是有效的 HTTP 或 HTTPS 地址');
  }
  return trimmed;
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) {
    return '';
  }
  if (apiKey.length <= 6) {
    return `${apiKey.slice(0, 2)}****`;
  }
  return `${apiKey.slice(0, 3)}${'*'.repeat(7)}${apiKey.slice(-2)}`;
}
