import { contextBridge, ipcRenderer } from 'electron';
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

const api = {
  getBootstrap: (): Promise<BootstrapPayload> => ipcRenderer.invoke('bootstrap:get'),
  listSessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke('sessions:list'),
  getSession: (id: string): Promise<SavedSession | null> => ipcRenderer.invoke('sessions:get', id),
  deleteSession: (id: string): Promise<SessionSummary[]> =>
    ipcRenderer.invoke('sessions:delete', id),
  getSettings: (): Promise<ModelSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: SaveModelSettingsInput): Promise<ModelSettings> =>
    ipcRenderer.invoke('settings:save', input),
  listAccountConfigs: (): Promise<PlatformAccountConfig[]> => ipcRenderer.invoke('accounts:list'),
  saveAccountConfig: (input: SavePlatformAccountInput): Promise<PlatformAccountConfig> =>
    ipcRenderer.invoke('accounts:save', input),
  deleteAccountConfig: (platformId: string): Promise<PlatformAccountConfig[]> =>
    ipcRenderer.invoke('accounts:delete', platformId),
  researchPlatformPreset: (
    input: ResearchPlatformPresetInput,
  ): Promise<PlatformPresetResearchResult> => ipcRenderer.invoke('platformPresets:research', input),
  runContentReview: (input: RunContentReviewInput): Promise<SavedSession> =>
    ipcRenderer.invoke('review:run', input),
  rewriteContentRisks: (input: RunContentRewriteInput): Promise<SavedSession> =>
    ipcRenderer.invoke('review:rewrite', input),
  generateAdaptations: (input: GenerateAdaptationsInput): Promise<SavedSession> =>
    ipcRenderer.invoke('adaptations:generate', input),
  runPublishTask: (
    input: { sessionId: string; platformId: PlatformId; mode: PublishMode },
  ): Promise<{ event: unknown; task: PublishTaskResult; session: SavedSession | null }> =>
    ipcRenderer.invoke('publish:run', input),
};

contextBridge.exposeInMainWorld('postPilot', api);
