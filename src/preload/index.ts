import { contextBridge, ipcRenderer } from 'electron';
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

const api = {
  getBootstrap: (): Promise<BootstrapPayload> => ipcRenderer.invoke('bootstrap:get'),
  listSessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke('sessions:list'),
  getSession: (id: string): Promise<SavedSession | null> => ipcRenderer.invoke('sessions:get', id),
  getSettings: (): Promise<ModelSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: SaveModelSettingsInput): Promise<ModelSettings> =>
    ipcRenderer.invoke('settings:save', input),
  listAccountConfigs: (): Promise<PlatformAccountConfig[]> => ipcRenderer.invoke('accounts:list'),
  saveAccountConfig: (input: SavePlatformAccountInput): Promise<PlatformAccountConfig> =>
    ipcRenderer.invoke('accounts:save', input),
  deleteAccountConfig: (platformId: PlatformId): Promise<PlatformAccountConfig[]> =>
    ipcRenderer.invoke('accounts:delete', platformId),
  verifyAccountConfig: (
    input: VerifyPlatformAccountInput,
  ): Promise<VerifyPlatformAccountResult> => ipcRenderer.invoke('accounts:verify', input),
  updateDraft: (input: UpdateDraftInput): Promise<SavedSession> =>
    ipcRenderer.invoke('drafts:update', input),
  runContentReview: (input: RunContentReviewInput): Promise<SavedSession> =>
    ipcRenderer.invoke('review:run', input),
  generateAdaptations: (input: GenerateAdaptationsInput): Promise<SavedSession> =>
    ipcRenderer.invoke('adaptations:generate', input),
  runPublishTask: (
    input: { sessionId: string; platformId: PlatformId; mode: PublishMode },
  ): Promise<{ event: unknown; task: PublishTaskResult; session: SavedSession | null }> =>
    ipcRenderer.invoke('publish:run', input),
};

contextBridge.exposeInMainWorld('postPilot', api);
