import type {
  BootstrapPayload,
  GenerateAdaptationsInput,
  ModelSettings,
  PlatformId,
  PublishMode,
  PublishTaskResult,
  SaveModelSettingsInput,
  SavedSession,
  SessionSummary,
  UpdateDraftInput,
} from '../shared/types';

declare global {
  interface Window {
    postPilot: {
      getBootstrap(): Promise<BootstrapPayload>;
      listSessions(): Promise<SessionSummary[]>;
      getSession(id: string): Promise<SavedSession | null>;
      getSettings(): Promise<ModelSettings>;
      saveSettings(input: SaveModelSettingsInput): Promise<ModelSettings>;
      updateDraft(input: UpdateDraftInput): Promise<SavedSession>;
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
