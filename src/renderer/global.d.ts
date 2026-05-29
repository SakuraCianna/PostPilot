import type {
  BootstrapPayload,
  GenerateAdaptationsInput,
  ModelSettings,
  PlatformId,
  PlatformAccountConfig,
  PublishMode,
  PublishTaskResult,
  RunContentReviewInput,
  SaveModelSettingsInput,
  SavePlatformAccountInput,
  SavedSession,
  SessionSummary,
  UpdateDraftInput,
  VerifyPlatformAccountInput,
  VerifyPlatformAccountResult,
} from '../shared/types';

declare global {
  interface Window {
    postPilot: {
      getBootstrap(): Promise<BootstrapPayload>;
      listSessions(): Promise<SessionSummary[]>;
      getSession(id: string): Promise<SavedSession | null>;
      getSettings(): Promise<ModelSettings>;
      saveSettings(input: SaveModelSettingsInput): Promise<ModelSettings>;
      listAccountConfigs(): Promise<PlatformAccountConfig[]>;
      saveAccountConfig(input: SavePlatformAccountInput): Promise<PlatformAccountConfig>;
      deleteAccountConfig(platformId: PlatformId): Promise<PlatformAccountConfig[]>;
      verifyAccountConfig(input: VerifyPlatformAccountInput): Promise<VerifyPlatformAccountResult>;
      updateDraft(input: UpdateDraftInput): Promise<SavedSession>;
      runContentReview(input: RunContentReviewInput): Promise<SavedSession>;
      generateAdaptations(input: GenerateAdaptationsInput): Promise<SavedSession>;
      runPublishTask(input: {
        sessionId: string;
        platformId: PlatformId;
        mode: PublishMode;
      }): Promise<{ event: unknown; task: PublishTaskResult; session: SavedSession | null }>;
    };
  }
}

export {};
