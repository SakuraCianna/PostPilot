import type {
  BootstrapPayload,
  GenerateAdaptationsInput,
  ModelSettings,
  PlatformId,
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
      simulatePublish(input: {
        sessionId: string;
        platformId: PlatformId;
      }): Promise<{ event: unknown; session: SavedSession | null }>;
    };
  }
}

export {};
