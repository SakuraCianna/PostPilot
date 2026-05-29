import type {
  BootstrapPayload,
  GenerateAdaptationsInput,
  ModelSettings,
  PlatformId,
  PlatformAccountConfig,
  PublishMode,
  PublishTaskResult,
  RunContentReviewInput,
  RunContentRewriteInput,
  SaveModelSettingsInput,
  SavePlatformAccountInput,
  SavedSession,
  SessionSummary,
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
      deleteAccountConfig(platformId: string): Promise<PlatformAccountConfig[]>;
      verifyAccountConfig(input: VerifyPlatformAccountInput): Promise<VerifyPlatformAccountResult>;
      runContentReview(input: RunContentReviewInput): Promise<SavedSession>;
      rewriteContentRisks(input: RunContentRewriteInput): Promise<SavedSession>;
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
