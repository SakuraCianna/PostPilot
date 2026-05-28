import type {
  BootstrapPayload,
  GenerateAdaptationsInput,
  PlatformId,
  SavedSession,
  SessionSummary,
} from '../shared/types';

declare global {
  interface Window {
    postPilot: {
      getBootstrap(): Promise<BootstrapPayload>;
      listSessions(): Promise<SessionSummary[]>;
      getSession(id: string): Promise<SavedSession | null>;
      generateAdaptations(input: GenerateAdaptationsInput): Promise<SavedSession>;
      simulatePublish(input: {
        sessionId: string;
        platformId: PlatformId;
      }): Promise<{ event: unknown; session: SavedSession | null }>;
    };
  }
}

export {};
