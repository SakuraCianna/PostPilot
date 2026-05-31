import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccountRepository } from './db/accountRepository';
import { createDatabase } from './db/database';
import { createSessionRepository } from './db/sessionRepository';
import { createSettingsRepository, type SecretCodec } from './db/settingsRepository';
import { reviewContentSafety } from './services/contentReview';
import { rewriteContentRisks } from './services/contentRewrite';
import { generateAdaptations } from './services/deepseek';
import { createPlatformPresetResearchService } from './services/platformPresetResearch';
import { createPublishTask } from './services/publishers';
import {
  createCustomPlatformAdapters,
  createLocalDrafts,
  PLATFORM_ADAPTERS,
} from '../shared/platformAdapters';
import {
  DEEPSEEK_MODEL,
  type GenerateAdaptationsInput,
  type PlatformId,
  type PublishMode,
  type ResearchPlatformPresetInput,
  type RunContentReviewInput,
  type RunContentRewriteInput,
  type SaveModelSettingsInput,
  type SavePlatformAccountInput,
} from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (process.env.POSTPILOT_USER_DATA) {
  app.setPath('userData', process.env.POSTPILOT_USER_DATA);
}

const db = createDatabase(path.join(app.getPath('userData'), 'postpilot.sqlite'));
const secretCodec = createSecretCodec();
const sessions = createSessionRepository(db);
const settings = createSettingsRepository(db, secretCodec);
const accounts = createAccountRepository(db, secretCodec);
const platformPresets = createPlatformPresetResearchService({
  presetDir: path.join(app.getPath('userData'), 'platform-presets'),
});

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
  platforms: getActivePlatformAdapters(),
  sessions: sessions.listSessions(),
  settings: settings.getModelSettings(),
  accountConfigs: accounts.listAccountConfigs(),
}));

ipcMain.handle('sessions:list', () => sessions.listSessions());

ipcMain.handle('sessions:get', (_event, id: string) => sessions.getSession(id));

ipcMain.handle('settings:get', () => settings.getModelSettings());

ipcMain.handle('settings:save', (_event, input: SaveModelSettingsInput) =>
  settings.saveModelSettings(input),
);

ipcMain.handle('accounts:list', () => accounts.listAccountConfigs());

ipcMain.handle('accounts:save', (_event, input: SavePlatformAccountInput) =>
  accounts.saveAccountConfig(input),
);

ipcMain.handle('accounts:delete', (_event, platformId: string) => {
  accounts.deleteAccountConfig(platformId);
  return accounts.listAccountConfigs();
});

ipcMain.handle(
  'platformPresets:research',
  async (_event, input: ResearchPlatformPresetInput) =>
    platformPresets.researchPlatformPreset({
      platformId: input.platformId,
      displayName: input.displayName,
      apiKey: process.env.TAVILY_API_KEY,
    }),
);

ipcMain.handle('review:run', async (_event, input: RunContentReviewInput) => {
  const session = sessions.getSession(input.sessionId);
  if (!session) {
    throw new Error('未找到要审查的历史记录');
  }

  return runAndSaveContentReview(session);
});

ipcMain.handle('review:rewrite', async (_event, input: RunContentRewriteInput) => {
  const session = sessions.getSession(input.sessionId);
  if (!session) {
    throw new Error('未找到要优化的历史记录');
  }
  if (!session.contentReview) {
    throw new Error('请先完成内容审查');
  }
  if (session.contentReview.issues.length === 0) {
    throw new Error('当前内容未发现需要优化的风险表达');
  }

  const secret = settings.getDeepSeekSecret();
  const result = await rewriteContentRisks({
    content: {
      title: session.title,
      body: session.sourceBody,
    },
    drafts: session.drafts,
    review: session.contentReview,
    apiKey: secret.apiKey || process.env.DEEPSEEK_API_KEY,
    baseUrl: secret.baseUrl || process.env.DEEPSEEK_BASE_URL,
  });

  return sessions.saveSession({
    id: session.id,
    title: session.title,
    sourceBody: session.sourceBody,
    drafts: result.drafts,
    model: result.model,
    modelStatus: result.modelStatus,
    modelMessage: result.message,
    contentReview: null,
  });
});

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
    drafts: withCustomPlatformDrafts(result.drafts, { title, body }),
    model: result.model,
    modelStatus: result.modelStatus,
    modelMessage: result.modelMessage,
  });
});

ipcMain.handle(
  'publish:run',
  async (_event, input: { sessionId: string; platformId: PlatformId; mode: PublishMode }) => {
    const session = sessions.getSession(input.sessionId);
    if (!session) {
      throw new Error('未找到对应历史记录');
    }

    const reviewedSession = await ensureContentReview(session);
    const draft = reviewedSession.drafts.find((item) => item.platformId === input.platformId);
    if (!draft) {
      throw new Error('未找到对应平台草稿');
    }

    const task = await createPublishTask(
      {
        sessionId: input.sessionId,
        draft,
        mode: input.mode,
        contentReview: reviewedSession.contentReview,
      },
      {
        adapters: getActivePlatformAdapters(),
      },
    );

    const event = sessions.recordPublishEvent({
      sessionId: input.sessionId,
      ...task.event,
    });

    return {
      event,
      task,
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

function getActivePlatformAdapters() {
  return [
    ...PLATFORM_ADAPTERS,
    ...createCustomPlatformAdapters(
      accounts.listAccountConfigs(),
      platformPresets.readPresetMarkdowns(),
    ),
  ];
}

function withCustomPlatformDrafts(
  drafts: ReturnType<typeof createLocalDrafts>,
  content: { title: string; body: string },
) {
  const customAdapters = createCustomPlatformAdapters(
    accounts.listAccountConfigs(),
    platformPresets.readPresetMarkdowns(),
  );
  if (customAdapters.length === 0) {
    return drafts;
  }

  const customDrafts = createLocalDrafts(content, customAdapters).filter((draft) =>
    customAdapters.some((adapter) => adapter.id === draft.platformId),
  );
  const existingPlatformIds = new Set(drafts.map((draft) => draft.platformId));
  return [
    ...drafts,
    ...customDrafts.filter((draft) => !existingPlatformIds.has(draft.platformId)),
  ];
}

async function ensureContentReview(session: NonNullable<ReturnType<typeof sessions.getSession>>) {
  if (session.contentReview) {
    return session;
  }
  return runAndSaveContentReview(session);
}

async function runAndSaveContentReview(
  session: NonNullable<ReturnType<typeof sessions.getSession>>,
) {
  const secret = settings.getDeepSeekSecret();
  const review = await reviewContentSafety({
    content: {
      title: session.title,
      body: session.sourceBody,
    },
    drafts: session.drafts,
    apiKey: secret.apiKey || process.env.DEEPSEEK_API_KEY,
    baseUrl: secret.baseUrl || process.env.DEEPSEEK_BASE_URL,
  });

  return sessions.saveContentReview(session.id, review);
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
