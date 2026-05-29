export const DEEPSEEK_MODEL = 'deepseek-v4-flash' as const;

export type DeepSeekModel = typeof DEEPSEEK_MODEL;

export type PlatformId = 'wechat' | 'zhihu' | 'bilibili' | 'xiaohongshu';

export type PublishMode = 'officialApi' | 'browserAssist' | 'simulated' | 'exportOnly';

export type DraftStatus = 'ready' | 'needs-review';

export type ModelStatus = 'ai' | 'local-fallback' | 'error-fallback';

export interface CanonicalContent {
  title: string;
  body: string;
}

export interface PlatformLimits {
  titleMax: number;
  bodyMax?: number;
  hashtagMax: number;
}

export interface PlatformAdapter {
  id: PlatformId;
  displayName: string;
  description: string;
  tone: string;
  capabilities: string[];
  publishModes: PublishMode[];
  limits: PlatformLimits;
  exportFormat: 'html' | 'markdown' | 'plain';
}

export interface PlatformDraft {
  platformId: PlatformId;
  title: string;
  summary: string;
  body: string;
  hashtags: string[];
  status: DraftStatus;
  warnings?: string[];
}

export interface AdaptationResult {
  drafts: PlatformDraft[];
  model: DeepSeekModel;
  modelStatus: ModelStatus;
  modelMessage: string;
}

export interface SavedSession {
  id: string;
  title: string;
  sourceBody: string;
  drafts: PlatformDraft[];
  model: DeepSeekModel;
  modelStatus: ModelStatus;
  modelMessage: string;
  createdAt: string;
  updatedAt: string;
  publishEvents: PublishEvent[];
}

export interface SessionSummary {
  id: string;
  title: string;
  sourceBody: string;
  modelStatus: ModelStatus;
  updatedAt: string;
}

export interface SaveSessionInput {
  id?: string;
  title: string;
  sourceBody: string;
  drafts: PlatformDraft[];
  model: DeepSeekModel;
  modelStatus: ModelStatus;
  modelMessage: string;
}

export interface PublishEventInput {
  sessionId: string;
  platformId: PlatformId;
  mode: PublishMode;
  status: 'success' | 'failed';
  message: string;
}

export interface PublishEvent extends PublishEventInput {
  id: string;
  createdAt: string;
}

export interface GenerateAdaptationsInput extends CanonicalContent {
  sessionId?: string;
}

export interface UpdateDraftInput {
  sessionId: string;
  draft: PlatformDraft;
}

export interface BootstrapPayload {
  model: DeepSeekModel;
  platforms: PlatformAdapter[];
  sessions: SessionSummary[];
  settings: ModelSettings;
}

export interface ModelSettings {
  model: DeepSeekModel;
  baseUrl: string;
  apiKeyConfigured: boolean;
  maskedApiKey: string;
}

export interface SaveModelSettingsInput {
  apiKey?: string;
  baseUrl: string;
}

export interface DeepSeekSecret {
  apiKey: string;
  baseUrl: string;
}
