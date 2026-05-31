export const DEEPSEEK_MODEL = 'deepseek-v4-flash' as const;

export type DeepSeekModel = typeof DEEPSEEK_MODEL;

export type BuiltInPlatformId =
  | 'wechat'
  | 'zhihu'
  | 'bilibili'
  | 'xiaohongshu'
  | 'douyin'
  | 'kuaishou'
  | 'weibo'
  | 'toutiao'
  | 'baijiahao';

export type PlatformId = BuiltInPlatformId | (string & {});

export type PublishMode = 'simulated';

export type DraftStatus = 'ready' | 'needs-review';

export type ModelStatus = 'ai' | 'local-fallback' | 'error-fallback';

export type ContentReviewStatus = 'passed' | 'needs-attention' | 'blocked';

export type ContentRiskKind = 'legal' | 'values';

export type ContentRiskConfidence = 'low' | 'medium' | 'high';

export type PlatformAccountStatus =
  | 'not-configured'
  | 'configured'
  | 'authorized'
  | 'auth-failed';

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
  styleGuide?: string;
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

export interface ContentReviewIssue {
  id: string;
  kind: ContentRiskKind;
  platformId?: PlatformId;
  snippet: string;
  reason: string;
  suggestion: string;
  confidence: ContentRiskConfidence;
}

export interface ContentReviewResult {
  status: ContentReviewStatus;
  model: DeepSeekModel;
  modelStatus: ModelStatus;
  message: string;
  reviewedAt: string;
  issues: ContentReviewIssue[];
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
  contentReview?: ContentReviewResult;
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
  contentReview?: ContentReviewResult | null;
}

export interface PublishEventInput {
  sessionId: string;
  platformId: PlatformId;
  mode: PublishMode;
  status: 'success' | 'failed' | 'pending';
  message: string;
  attempts?: number;
}

export interface PublishEvent extends PublishEventInput {
  id: string;
  createdAt: string;
}

export interface GenerateAdaptationsInput extends CanonicalContent {
  sessionId?: string;
}

export interface BootstrapPayload {
  model: DeepSeekModel;
  platforms: PlatformAdapter[];
  sessions: SessionSummary[];
  settings: ModelSettings;
  accountConfigs: PlatformAccountConfig[];
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

export interface PublishTaskInput {
  sessionId?: string;
  draft: PlatformDraft;
  mode: PublishMode;
  contentReview?: ContentReviewResult;
}

export interface PublishTaskResult {
  status: 'success' | 'pending' | 'failed';
  event: Omit<PublishEventInput, 'sessionId'>;
}

export interface PlatformAccountFieldSchema {
  key: string;
  label: string;
  required: boolean;
  secret?: boolean;
  kind?: 'text' | 'password' | 'select';
  options?: Array<{
    label: string;
    value: string;
  }>;
}

export interface PlatformAccountSchema {
  platformId: BuiltInPlatformId;
  displayName: string;
  supportsOfficialApi: boolean;
  fields: PlatformAccountFieldSchema[];
}

export interface PlatformAccountConfig {
  platformId: string;
  displayName: string;
  builtIn: boolean;
  enabled: boolean;
  configured: boolean;
  status: PlatformAccountStatus;
  statusMessage: string;
  maskedFields: Record<string, string>;
  updatedAt?: string;
  lastVerifiedAt?: string;
}

export interface SecretPlatformAccountConfig {
  platformId: string;
  enabled: boolean;
  fields: Record<string, string>;
}

export interface SavePlatformAccountInput {
  platformId: string;
  displayName?: string;
  enabled: boolean;
  fields: Record<string, string>;
}

export interface VerifyPlatformAccountInput {
  platformId: string;
}

export interface RunContentReviewInput {
  sessionId: string;
}

export interface RunContentRewriteInput {
  sessionId: string;
}

export interface VerifyPlatformAccountResult {
  platformId: string;
  status: PlatformAccountStatus;
  message: string;
  checkedAt: string;
}

export interface ResearchPlatformPresetInput {
  platformId: string;
  displayName: string;
}

export interface PlatformPresetResearchResult {
  platformId: string;
  displayName: string;
  status: 'researched' | 'local-fallback';
  message: string;
  presetPath: string;
  sources: Array<{
    title: string;
    url: string;
  }>;
  updatedAt: string;
}
