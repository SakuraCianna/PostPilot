import {
  CUSTOM_PLATFORM_NAME_FIELD,
  PLATFORM_ACCOUNT_SCHEMAS,
  accountStatusMessage,
  createEmptyAccountConfig,
  isBuiltInPlatformId,
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
  platform_id: string;
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
    const builtIn = isBuiltInPlatformId(row.platform_id);
    return {
      platformId: row.platform_id,
      displayName: builtIn
        ? PLATFORM_ACCOUNT_SCHEMAS[row.platform_id as PlatformId].displayName
        : fields[CUSTOM_PLATFORM_NAME_FIELD] || row.platform_id,
      builtIn,
      enabled: row.enabled === 1,
      configured: Object.keys(fields).length > 0,
      status: row.auth_status,
      statusMessage: row.auth_message,
      maskedFields: maskAccountFields(row.platform_id, fields),
      updatedAt: row.updated_at,
      lastVerifiedAt: row.last_verified_at ?? undefined,
    };
  }

  function getRow(platformId: string): AccountConfigRow | null {
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
      const builtInConfigs = Object.keys(PLATFORM_ACCOUNT_SCHEMAS).map((platformId) => {
        const row = getRow(platformId as PlatformId);
        return row ? mapRow(row) : createEmptyAccountConfig(platformId as PlatformId);
      });
      const customRows = db
        .prepare('SELECT * FROM account_configs ORDER BY updated_at DESC')
        .all() as unknown as AccountConfigRow[];
      const customConfigs = customRows
        .filter((row) => !isBuiltInPlatformId(row.platform_id))
        .map((row) => mapRow(row));

      return [...builtInConfigs, ...customConfigs];
    },

    getSecretAccountConfig(platformId: string): SecretPlatformAccountConfig | null {
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
      const existing = getRow(input.platformId);
      const existingFields = existing ? parseFields(existing.fields_json) : {};
      const fields = {
        ...existingFields,
        ...(input.displayName?.trim()
          ? { [CUSTOM_PLATFORM_NAME_FIELD]: input.displayName.trim() }
          : {}),
        ...Object.fromEntries(
          Object.entries(input.fields)
            .map(([key, value]) => [key, value.trim()])
            .filter(([, value]) => value),
        ),
      };
      const validation = validateAccountFields(input.platformId, fields);
      if (!validation.valid) {
        throw new Error(validation.errors.join('；'));
      }

      const now = new Date().toISOString();

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

    deleteAccountConfig(platformId: string): void {
      db.prepare('DELETE FROM account_configs WHERE platform_id = ?').run(platformId);
    },
  };
}
