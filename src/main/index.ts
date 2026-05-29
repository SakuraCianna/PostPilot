import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db/database';
import { createSessionRepository } from './db/sessionRepository';
import { createSettingsRepository, type SecretCodec } from './db/settingsRepository';
import { generateAdaptations } from './services/deepseek';
import {
  createLocalDrafts,
  PLATFORM_ADAPTERS,
} from '../shared/platformAdapters';
import {
  DEEPSEEK_MODEL,
  type GenerateAdaptationsInput,
  type PlatformId,
  type SaveModelSettingsInput,
} from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (process.env.POSTPILOT_USER_DATA) {
  app.setPath('userData', process.env.POSTPILOT_USER_DATA);
}

const db = createDatabase(path.join(app.getPath('userData'), 'postpilot.sqlite'));
const sessions = createSessionRepository(db);
const settings = createSettingsRepository(db, createSecretCodec());

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    title: 'PostPilot',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('bootstrap:get', () => ({
  model: DEEPSEEK_MODEL,
  platforms: PLATFORM_ADAPTERS,
  sessions: sessions.listSessions(),
  settings: settings.getModelSettings(),
}));

ipcMain.handle('sessions:list', () => sessions.listSessions());

ipcMain.handle('sessions:get', (_event, id: string) => sessions.getSession(id));

ipcMain.handle('settings:get', () => settings.getModelSettings());

ipcMain.handle('settings:save', (_event, input: SaveModelSettingsInput) =>
  settings.saveModelSettings(input),
);

ipcMain.handle('adaptations:generate', async (_event, input: GenerateAdaptationsInput) => {
  const body = input.body.trim();
  if (!body) {
    throw new Error('正文不能为空');
  }

  const title = normalizeTitle(input.title, body);
  const secret = settings.getDeepSeekSecret();
  const result = await generateAdaptations({
    content: { title, body },
    apiKey: secret.apiKey || process.env.DEEPSEEK_API_KEY,
    baseUrl: secret.baseUrl || process.env.DEEPSEEK_BASE_URL,
  });

  return sessions.saveSession({
    id: input.sessionId,
    title,
    sourceBody: body,
    drafts: result.drafts,
    model: result.model,
    modelStatus: result.modelStatus,
    modelMessage: result.modelMessage,
  });
});

ipcMain.handle(
  'publish:simulate',
  (_event, input: { sessionId: string; platformId: PlatformId }) => {
    const session = sessions.getSession(input.sessionId);
    if (!session) {
      throw new Error('未找到对应历史记录');
    }

    const adapter = PLATFORM_ADAPTERS.find((item) => item.id === input.platformId);
    if (!adapter) {
      throw new Error('未找到对应平台');
    }

    const event = sessions.recordPublishEvent({
      sessionId: input.sessionId,
      platformId: input.platformId,
      mode: 'simulated',
      status: 'success',
      message: `${adapter.displayName} 模拟发布已完成`,
    });

    return {
      event,
      session: sessions.getSession(input.sessionId),
    };
  },
);

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  db.close();
});

function normalizeTitle(title: string, body: string): string {
  const trimmed = title.trim();
  if (trimmed) {
    return trimmed;
  }
  return createLocalDrafts({ title: '', body })[0]?.title ?? '未命名内容';
}

function createSecretCodec(): SecretCodec {
  return {
    encrypt(value: string): string {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(value).toString('base64');
      }
      return Buffer.from(value, 'utf8').toString('base64');
    },
    decrypt(value: string): string {
      const buffer = Buffer.from(value, 'base64');
      if (safeStorage.isEncryptionAvailable()) {
        try {
          return safeStorage.decryptString(buffer);
        } catch {
          return buffer.toString('utf8');
        }
      }
      return buffer.toString('utf8');
    },
  };
}
