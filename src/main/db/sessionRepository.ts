import { randomUUID } from 'node:crypto';
import type {
  ModelStatus,
  PlatformDraft,
  PlatformId,
  PublishEvent,
  PublishEventInput,
  PublishMode,
  SaveSessionInput,
  SavedSession,
  SessionSummary,
} from '../../shared/types';
import type { PostPilotDatabase } from './database';

interface SessionRow {
  id: string;
  title: string;
  source_body: string;
  drafts_json: string;
  model: 'deepseek-v4-flash';
  model_status: ModelStatus;
  model_message: string;
  created_at: string;
  updated_at: string;
}

interface PublishEventRow {
  id: string;
  session_id: string;
  platform_id: PlatformId;
  mode: PublishMode;
  status: 'success' | 'failed';
  message: string;
  created_at: string;
}

export function createSessionRepository(db: PostPilotDatabase) {
  return {
    saveSession(input: SaveSessionInput): SavedSession {
      const now = new Date().toISOString();
      const id = input.id ?? randomUUID();
      const existing = db.prepare('SELECT id, created_at FROM sessions WHERE id = ?').get(id) as
        | Pick<SessionRow, 'id' | 'created_at'>
        | undefined;

      if (existing) {
        db.prepare(`
          UPDATE sessions
          SET title = ?, source_body = ?, drafts_json = ?, model = ?, model_status = ?, model_message = ?, updated_at = ?
          WHERE id = ?
        `).run(
          input.title,
          input.sourceBody,
          JSON.stringify(input.drafts),
          input.model,
          input.modelStatus,
          input.modelMessage,
          now,
          id,
        );
      } else {
        db.prepare(`
          INSERT INTO sessions (id, title, source_body, drafts_json, model, model_status, model_message, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.title,
          input.sourceBody,
          JSON.stringify(input.drafts),
          input.model,
          input.modelStatus,
          input.modelMessage,
          now,
          now,
        );
      }

      const saved = this.getSession(id);
      if (!saved) {
        throw new Error('保存后读取历史记录失败');
      }
      return saved;
    },

    listSessions(): SessionSummary[] {
      const rows = db
        .prepare(
          'SELECT id, title, source_body, model_status, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 100',
        )
        .all() as Array<
        Pick<SessionRow, 'id' | 'title' | 'source_body' | 'model_status' | 'updated_at'>
      >;

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        sourceBody: row.source_body,
        modelStatus: row.model_status,
        updatedAt: row.updated_at,
      }));
    },

    getSession(id: string): SavedSession | null {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
      if (!row) {
        return null;
      }

      const eventRows = db
        .prepare('SELECT * FROM publish_events WHERE session_id = ? ORDER BY created_at DESC')
        .all(id) as unknown as PublishEventRow[];

      return mapSession(row, eventRows);
    },

    recordPublishEvent(input: PublishEventInput): PublishEvent {
      const id = randomUUID();
      const createdAt = new Date().toISOString();

      db.prepare(`
        INSERT INTO publish_events (id, session_id, platform_id, mode, status, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.sessionId,
        input.platformId,
        input.mode,
        input.status,
        input.message,
        createdAt,
      );

      db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(createdAt, input.sessionId);

      return {
        id,
        sessionId: input.sessionId,
        platformId: input.platformId,
        mode: input.mode,
        status: input.status,
        message: input.message,
        createdAt,
      };
    },
  };
}

function mapSession(row: SessionRow, eventRows: PublishEventRow[]): SavedSession {
  return {
    id: row.id,
    title: row.title,
    sourceBody: row.source_body,
    drafts: JSON.parse(row.drafts_json) as PlatformDraft[],
    model: row.model,
    modelStatus: row.model_status,
    modelMessage: row.model_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishEvents: eventRows.map((event) => ({
      id: event.id,
      sessionId: event.session_id,
      platformId: event.platform_id,
      mode: event.mode,
      status: event.status,
      message: event.message,
      createdAt: event.created_at,
    })),
  };
}
