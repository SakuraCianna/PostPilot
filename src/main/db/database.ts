import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type PostPilotDatabase = DatabaseSync;

export function createDatabase(dbPath: string): PostPilotDatabase {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath, {
    timeout: 5000,
  });

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_body TEXT NOT NULL,
      drafts_json TEXT NOT NULL,
      model TEXT NOT NULL,
      model_status TEXT NOT NULL,
      model_message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS publish_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      receipt_json TEXT,
      attempts INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_publish_events_session_id ON publish_events(session_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS account_configs (
      platform_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      fields_json TEXT NOT NULL,
      auth_status TEXT NOT NULL,
      auth_message TEXT NOT NULL,
      last_verified_at TEXT,
      updated_at TEXT NOT NULL
    ) STRICT;
  `);

  ensureColumn(db, 'publish_events', 'receipt_json', 'TEXT');
  ensureColumn(db, 'publish_events', 'attempts', 'INTEGER NOT NULL DEFAULT 1');

  return db;
}

function ensureColumn(db: PostPilotDatabase, tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
