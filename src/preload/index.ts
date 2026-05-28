import { contextBridge, ipcRenderer } from 'electron';
import type {
  BootstrapPayload,
  GenerateAdaptationsInput,
  PlatformId,
  SavedSession,
  SessionSummary,
} from '../shared/types';

const api = {
  getBootstrap: (): Promise<BootstrapPayload> => ipcRenderer.invoke('bootstrap:get'),
  listSessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke('sessions:list'),
  getSession: (id: string): Promise<SavedSession | null> => ipcRenderer.invoke('sessions:get', id),
  generateAdaptations: (input: GenerateAdaptationsInput): Promise<SavedSession> =>
    ipcRenderer.invoke('adaptations:generate', input),
  simulatePublish: (
    input: { sessionId: string; platformId: PlatformId },
  ): Promise<{ event: unknown; session: SavedSession | null }> =>
    ipcRenderer.invoke('publish:simulate', input),
};

contextBridge.exposeInMainWorld('postPilot', api);
