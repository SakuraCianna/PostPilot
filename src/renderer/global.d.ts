import type {
  BootstrapPayload,
  GenerateAdaptationsInput,
  ModelSettings,
  PlatformId,
  PlatformAccountConfig,
  PublishMode,
  PublishTaskResult,
  PlatformPresetResearchResult,
  ResearchPlatformPresetInput,
  RunContentReviewInput,
  RunContentRewriteInput,
  SaveModelSettingsInput,
  SavePlatformAccountInput,
  SavedSession,
  SessionSummary,
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
      researchPlatformPreset(
        input: ResearchPlatformPresetInput,
      ): Promise<PlatformPresetResearchResult>;
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
