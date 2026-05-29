import {
  PLATFORM_ACCOUNT_SCHEMAS,
  accountStatusMessage,
  createEmptyAccountConfig,
  maskAccountFields,
  validateAccountFields,
} from '../../shared/platformAccounts';
import type {
  PlatformAccountConfig,
  PlatformAccountStatus,
  PlatformId,
  SavePlatformAccountInput,
  SecretPlatformAccountConfig,
  VerifyPlatformAccountResult,
} from '../../shared/types';
import type { PostPilotDatabase } from './database';
import type { SecretCodec } from './settingsRepository';

interface AccountConfigRow {
  platform_id: PlatformId;
  enabled: 0 | 1;
  fields_json: string;
  auth_status: PlatformAccountStatus;
  auth_message: string;
  last_verified_at: string | null;
  updated_at: string;
}

export function createAccountRepository(db: PostPilotDatabase, codec: SecretCodec) {
  function mapRow(row: AccountConfigRow): PlatformAccountConfig {
    const fields = parseFields(row.fields_json);
    return {
      platformId: row.platform_id,
      enabled: row.enabled === 1,
      configured: Object.keys(fields).length > 0,
      status: row.auth_status,
      statusMessage: row.auth_message,
      maskedFields: maskAccountFields(row.platform_id, fields),
      updatedAt: row.updated_at,
      lastVerifiedAt: row.last_verified_at ?? undefined,
    };
  }

  function getRow(platformId: PlatformId): AccountConfigRow | null {
    return (
      (db
        .prepare('SELECT * FROM account_configs WHERE platform_id = ?')
        .get(platformId) as AccountConfigRow | undefined) ?? null
    );
  }

  function parseFields(encryptedJson: string): Record<string, string> {
    return JSON.parse(codec.decrypt(encryptedJson)) as Record<string, string>;
  }

  return {
    listAccountConfigs(): PlatformAccountConfig[] {
      return Object.keys(PLATFORM_ACCOUNT_SCHEMAS).map((platformId) => {
        const row = getRow(platformId as PlatformId);
        return row ? mapRow(row) : createEmptyAccountConfig(platformId as PlatformId);
      });
    },

    getSecretAccountConfig(platformId: PlatformId): SecretPlatformAccountConfig | null {
      const row = getRow(platformId);
      if (!row) {
        return null;
      }
      return {
        platformId,
        enabled: row.enabled === 1,
        fields: parseFields(row.fields_json),
      };
    },

    saveAccountConfig(input: SavePlatformAccountInput): PlatformAccountConfig {
      const validation = validateAccountFields(input.platformId, input.fields);
      if (!validation.valid) {
        throw new Error(validation.errors.join('；'));
      }

      const now = new Date().toISOString();
      const fields = Object.fromEntries(
        Object.entries(input.fields)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value),
      );

      db.prepare(`
        INSERT INTO account_configs (
          platform_id, enabled, fields_json, auth_status, auth_message, last_verified_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(platform_id) DO UPDATE SET
          enabled = excluded.enabled,
          fields_json = excluded.fields_json,
          auth_status = excluded.auth_status,
          auth_message = excluded.auth_message,
          updated_at = excluded.updated_at
      `).run(
        input.platformId,
        input.enabled ? 1 : 0,
        codec.encrypt(JSON.stringify(fields)),
        'configured',
        accountStatusMessage('configured'),
        now,
      );

      const row = getRow(input.platformId);
      if (!row) {
        throw new Error('保存账号配置后读取失败');
      }
      return mapRow(row);
    },

    updateAuthResult(result: VerifyPlatformAccountResult): PlatformAccountConfig {
      db.prepare(`
        UPDATE account_configs
        SET auth_status = ?, auth_message = ?, last_verified_at = ?, updated_at = ?
        WHERE platform_id = ?
      `).run(result.status, result.message, result.checkedAt, result.checkedAt, result.platformId);

      const row = getRow(result.platformId);
      if (!row) {
        throw new Error('更新授权状态后读取失败');
      }
      return mapRow(row);
    },

    deleteAccountConfig(platformId: PlatformId): void {
      db.prepare('DELETE FROM account_configs WHERE platform_id = ?').run(platformId);
    },
  };
}
