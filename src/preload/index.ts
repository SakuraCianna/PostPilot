import { contextBridge, ipcRenderer } from 'electron';
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

const api = {
  getBootstrap: (): Promise<BootstrapPayload> => ipcRenderer.invoke('bootstrap:get'),
  listSessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke('sessions:list'),
  getSession: (id: string): Promise<SavedSession | null> => ipcRenderer.invoke('sessions:get', id),
  getSettings: (): Promise<ModelSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: SaveModelSettingsInput): Promise<ModelSettings> =>
    ipcRenderer.invoke('settings:save', input),
  updateDraft: (input: UpdateDraftInput): Promise<SavedSession> =>
    ipcRenderer.invoke('drafts:update', input),
  generateAdaptations: (input: GenerateAdaptationsInput): Promise<SavedSession> =>
    ipcRenderer.invoke('adaptations:generate', input),
  runPublishTask: (
    input: { sessionId: string; platformId: PlatformId; mode: PublishMode },
  ): Promise<{ event: unknown; task: PublishTaskResult; session: SavedSession | null }> =>
    ipcRenderer.invoke('publish:run', input),
};

contextBridge.exposeInMainWorld('postPilot', api);
