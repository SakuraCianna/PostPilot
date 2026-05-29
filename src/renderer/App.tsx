import {
  Check,
  Clipboard,
  Download,
  Eye,
  History,
  Loader2,
  PencilLine,
  Play,
  Plus,
  Save,
  Send,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import {
  applyDraftValidation,
  createLocalDrafts,
  formatDraftForClipboard,
  PLATFORM_ADAPTERS,
} from '../shared/platformAdapters';
import { createDraftPreviewHtml } from './previewMarkup';
import {
  DEEPSEEK_MODEL,
  type ModelSettings,
  type PlatformDraft,
  type PlatformId,
  type PublishMode,
  type SavedSession,
  type SessionSummary,
} from '../shared/types';

const INITIAL_BODY = `把你的原始内容粘贴到这里。

PostPilot 会生成公众号, 知乎, B 站, 小红书四个平台版本。

第一版默认保存历史, 并支持复制, 导出和模拟发布。`;

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<SavedSession | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('wechat');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(INITIAL_BODY);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [settingsBaseUrl, setSettingsBaseUrl] = useState('https://api.deepseek.com');
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [draftEdits, setDraftEdits] = useState<Partial<Record<PlatformId, PlatformDraft>>>({});
  const [draftViewMode, setDraftViewMode] = useState<'edit' | 'preview'>('preview');
  const [notice, setNotice] = useState('本地历史已连接 SQLite, 模型固定为 deepseek-v4-flash');

  useEffect(() => {
    window.postPilot.getBootstrap().then((payload) => {
      setSessions(payload.sessions);
      setSettings(payload.settings);
      setSettingsBaseUrl(payload.settings.baseUrl);
    });
  }, []);

  const previewDrafts = useMemo(() => {
    return currentSession?.drafts ?? createLocalDrafts({ title, body });
  }, [body, currentSession, title]);

  const selectedDraft = useMemo(() => {
    return (
      previewDrafts.find((draft) => draft.platformId === selectedPlatform) ??
      previewDrafts[0]
    );
  }, [previewDrafts, selectedPlatform]);

  const selectedAdapter = useMemo(
    () => PLATFORM_ADAPTERS.find((adapter) => adapter.id === selectedPlatform),
    [selectedPlatform],
  );

  const editableDraft = selectedDraft
    ? draftEdits[selectedDraft.platformId] ?? selectedDraft
    : null;

  const draftPreviewHtml = useMemo(() => {
    if (!editableDraft || !selectedAdapter) {
      return '';
    }
    return createDraftPreviewHtml(
      editableDraft,
      selectedAdapter.exportFormat,
      sanitizeDraftPreviewHtml,
    );
  }, [editableDraft, selectedAdapter]);

  useEffect(() => {
    if (!selectedDraft) {
      return;
    }
    setDraftEdits((current) => ({
      ...current,
      [selectedDraft.platformId]: selectedDraft,
    }));
  }, [currentSession?.id, selectedDraft]);

  async function refreshSessions() {
    setSessions(await window.postPilot.listSessions());
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setNotice('正在使用 DeepSeek 适配内容');

    try {
      const saved = await window.postPilot.generateAdaptations({
        sessionId: currentSession?.id,
        title,
        body,
      });
      setCurrentSession(saved);
      setTitle(saved.title);
      setBody(saved.sourceBody);
      setDraftEdits({});
      setDraftViewMode('preview');
      await refreshSessions();
      setNotice(saved.modelMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleLoadSession(id: string) {
    const loaded = await window.postPilot.getSession(id);
    if (!loaded) {
      setNotice('历史记录不存在');
      return;
    }

    setCurrentSession(loaded);
    setTitle(loaded.title);
    setBody(loaded.sourceBody);
    setDraftEdits({});
    setSelectedPlatform(loaded.drafts[0]?.platformId ?? 'wechat');
    setDraftViewMode('preview');
    setNotice(loaded.modelMessage);
  }

  function handleNewSession() {
    setCurrentSession(null);
    setTitle('');
    setBody('');
    setDraftEdits({});
    setSelectedPlatform('wechat');
    setDraftViewMode('preview');
    setNotice('已创建新的本地草稿');
  }

  async function handleCopy(draft: PlatformDraft) {
    await navigator.clipboard.writeText(formatDraftForClipboard(draft));
    setNotice(`已复制 ${getPlatformName(draft.platformId)} 版本`);
  }

  function downloadArtifact(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleRunPublishTask(platformId: PlatformId, mode: PublishMode) {
    if (!currentSession) {
      setNotice('请先生成并保存一次平台版本');
      return;
    }

    setIsPublishing(true);
    try {
      const sessionForPublish = await persistChangedDrafts(currentSession);
      const result = await window.postPilot.runPublishTask({
        sessionId: sessionForPublish.id,
        platformId,
        mode,
      });
      if (result.session) {
        setCurrentSession(result.session);
      }
      if (result.task.artifact) {
        downloadArtifact(
          result.task.artifact.filename,
          result.task.artifact.content,
          result.task.artifact.mimeType,
        );
      }
      await refreshSessions();
      setNotice(result.task.event.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '发布任务执行失败');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleSimulateAll() {
    if (!currentSession) {
      setNotice('请先生成并保存一次平台版本');
      return;
    }

    setIsPublishing(true);
    try {
      const sessionForPublish = await persistChangedDrafts(currentSession);
      let updated: SavedSession | null = sessionForPublish;
      for (const draft of sessionForPublish.drafts) {
        const result = await window.postPilot.runPublishTask({
          sessionId: sessionForPublish.id,
          platformId: draft.platformId,
          mode: 'simulated',
        });
        updated = result.session;
      }
      if (updated) {
        setCurrentSession(updated);
      }
      await refreshSessions();
      setNotice('四个平台模拟发布已完成');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模拟发布失败');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleSaveSettings() {
    setIsSavingSettings(true);
    try {
      const saved = await window.postPilot.saveSettings({
        apiKey: settingsApiKey.trim() ? settingsApiKey : undefined,
        baseUrl: settingsBaseUrl,
      });
      setSettings(saved);
      setSettingsBaseUrl(saved.baseUrl);
      setSettingsApiKey('');
      setIsSettingsOpen(false);
      setNotice(saved.apiKeyConfigured ? '模型设置已保存' : '模型设置已保存, API Key 已清空');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存模型设置失败');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleClearApiKey() {
    setIsSavingSettings(true);
    try {
      const saved = await window.postPilot.saveSettings({
        apiKey: '',
        baseUrl: settingsBaseUrl,
      });
      setSettings(saved);
      setSettingsApiKey('');
      setNotice('API Key 已清空');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '清空 API Key 失败');
    } finally {
      setIsSavingSettings(false);
    }
  }

  function openSettings() {
    setSettingsBaseUrl(settings?.baseUrl ?? 'https://api.deepseek.com');
    setSettingsApiKey('');
    setIsSettingsOpen(true);
  }

  function updateDraftEdit(patch: Partial<PlatformDraft>) {
    if (!editableDraft) {
      return;
    }
    setDraftEdits((current) => ({
      ...current,
      [editableDraft.platformId]: {
        ...applyDraftValidation({
          ...editableDraft,
          ...patch,
        }),
      },
    }));
  }

  async function persistChangedDrafts(session: SavedSession): Promise<SavedSession> {
    let latestSession = session;

    for (const draft of Object.values(draftEdits)) {
      if (!draft) {
        continue;
      }

      const savedDraft = latestSession.drafts.find(
        (item) => item.platformId === draft.platformId,
      );
      if (!savedDraft || areDraftsEqual(savedDraft, draft)) {
        continue;
      }

      latestSession = await window.postPilot.updateDraft({
        sessionId: latestSession.id,
        draft,
      });
      setDraftEdits((current) => ({
        ...current,
        [draft.platformId]:
          latestSession.drafts.find((item) => item.platformId === draft.platformId) ?? draft,
      }));
    }

    if (latestSession !== session) {
      setCurrentSession(latestSession);
      await refreshSessions();
    }

    return latestSession;
  }

  async function handleSaveDraft() {
    if (!currentSession || !editableDraft) {
      setNotice('请先生成并保存一次平台版本');
      return;
    }

    setIsSavingDraft(true);
    try {
      const saved = await window.postPilot.updateDraft({
        sessionId: currentSession.id,
        draft: editableDraft,
      });
      setCurrentSession(saved);
      setDraftEdits((current) => ({
        ...current,
        [editableDraft.platformId]:
          saved.drafts.find((draft) => draft.platformId === editableDraft.platformId) ??
          editableDraft,
      }));
      await refreshSessions();
      setNotice(`${getPlatformName(editableDraft.platformId)} 草稿修改已保存`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存草稿修改失败');
    } finally {
      setIsSavingDraft(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>PostPilot</strong>
            <span>创作者发布助手</span>
          </div>
        </div>

        <button className="new-button" type="button" onClick={handleNewSession}>
          <Plus size={16} />
          新内容
        </button>

        <div className="sidebar-title">
          <History size={15} />
          历史
        </div>

        <div className="history-list">
          {sessions.length === 0 ? (
            <p className="empty-text">生成后会自动保存到本地 SQLite</p>
          ) : (
            sessions.map((item) => (
              <button
                className={`history-item ${currentSession?.id === item.id ? 'active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => void handleLoadSession(item.id)}
              >
                <strong>{item.title}</strong>
                <span>{item.sourceBody.slice(0, 56)}</span>
                <time>{formatTime(item.updatedAt)}</time>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>多平台内容适配</h1>
            <p>{notice}</p>
          </div>
          <div className="topbar-actions">
            <button className="settings-button" type="button" onClick={openSettings}>
              <Settings size={15} />
              模型设置
            </button>
            <div className="model-pill">
              <Sparkles size={15} />
              {DEEPSEEK_MODEL}
            </div>
          </div>
        </header>

        <section className="editor-pane">
          <input
            className="title-input"
            placeholder="标题"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setCurrentSession(null);
              setDraftEdits({});
            }}
          />
          <textarea
            className="body-input"
            placeholder="输入或粘贴你的原始内容"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setCurrentSession(null);
              setDraftEdits({});
            }}
          />
          <div className="editor-actions">
            <span>{body.length} 字符</span>
            <button
              className="primary-button"
              type="button"
              disabled={isGenerating || body.trim().length === 0}
              onClick={() => void handleGenerate()}
            >
              {isGenerating ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
              生成平台版本
            </button>
          </div>
        </section>
      </main>

      <aside className="preview-pane">
        <div className="platform-tabs">
          {PLATFORM_ADAPTERS.map((adapter) => (
            <button
              key={adapter.id}
              className={selectedPlatform === adapter.id ? 'active' : ''}
              type="button"
              onClick={() => setSelectedPlatform(adapter.id)}
            >
              {adapter.displayName}
            </button>
          ))}
        </div>

        {editableDraft ? (
          <section className="draft-view">
            <div className="draft-heading">
              <div>
                <span>{getPlatformName(editableDraft.platformId)}</span>
                <input
                  className="draft-title-input"
                  value={editableDraft.title}
                  onChange={(event) => updateDraftEdit({ title: event.target.value })}
                />
              </div>
              <div className={`status ${editableDraft.status}`}>
                <Check size={14} />
                {editableDraft.status === 'ready' ? '可发布' : '待检查'}
              </div>
            </div>

            <textarea
              className="summary-input"
              value={editableDraft.summary}
              onChange={(event) => updateDraftEdit({ summary: event.target.value })}
            />

            {editableDraft.warnings && editableDraft.warnings.length > 0 ? (
              <div className="warnings">
                {editableDraft.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}

            <div className="draft-view-switch" aria-label="草稿查看方式">
              <button
                className={draftViewMode === 'preview' ? 'active' : ''}
                type="button"
                aria-pressed={draftViewMode === 'preview'}
                onClick={() => setDraftViewMode('preview')}
              >
                <Eye size={15} />
                预览
              </button>
              <button
                className={draftViewMode === 'edit' ? 'active' : ''}
                type="button"
                aria-pressed={draftViewMode === 'edit'}
                onClick={() => setDraftViewMode('edit')}
              >
                <PencilLine size={15} />
                编辑
              </button>
            </div>

            {draftViewMode === 'edit' ? (
              <textarea
                className="draft-body-input"
                value={editableDraft.body}
                onChange={(event) => updateDraftEdit({ body: event.target.value })}
              />
            ) : (
              <article
                className="draft-rendered-preview"
                dangerouslySetInnerHTML={{ __html: draftPreviewHtml }}
              />
            )}

            <input
              className="hashtags-input"
              value={editableDraft.hashtags.join(', ')}
              onChange={(event) =>
                updateDraftEdit({
                  hashtags: event.target.value
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              placeholder="话题标签, 用英文逗号分隔"
            />

            <div className="tags">
              {editableDraft.hashtags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>

            <div className="preview-actions">
              <button
                type="button"
                disabled={isSavingDraft}
                onClick={() => void handleSaveDraft()}
              >
                {isSavingDraft ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                保存修改
              </button>
              <button type="button" onClick={() => void handleCopy(editableDraft)}>
                <Clipboard size={16} />
                复制
              </button>
            </div>

            <div className="publish-modes">
              <div className="section-label">发布方式</div>
              <div className="publish-mode-grid">
                {(selectedAdapter?.publishModes ?? []).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={isPublishing}
                    onClick={() => void handleRunPublishTask(editableDraft.platformId, mode)}
                  >
                    {isPublishing && mode === 'simulated' ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      getPublishModeIcon(mode)
                    )}
                    {getPublishModeLabel(mode)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <div className="empty-preview">输入内容后可查看平台预览</div>
        )}

        <button
          className="publish-all"
          type="button"
          disabled={isPublishing || !currentSession}
          onClick={() => void handleSimulateAll()}
        >
          <Send size={16} />
          一键模拟发布全部平台
        </button>

        <section className="events">
          <h3>发布记录</h3>
          {currentSession?.publishEvents.length ? (
            currentSession.publishEvents.slice(0, 8).map((event) => (
              <div className="event-row" key={event.id}>
                <span>{getPlatformName(event.platformId)}</span>
                <small>{formatTime(event.createdAt)}</small>
              </div>
            ))
          ) : (
            <p className="empty-text">模拟发布后会记录在这里</p>
          )}
        </section>
      </aside>

      {isSettingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="settings-modal" aria-label="模型设置">
            <div className="modal-heading">
              <div>
                <h2>模型设置</h2>
                <p>API Key 会保存到本地 SQLite, 主进程会优先使用系统安全存储加密</p>
              </div>
              <button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <label className="field">
              <span>模型</span>
              <input value={DEEPSEEK_MODEL} disabled />
            </label>

            <label className="field">
              <span>DeepSeek API 地址</span>
              <input
                value={settingsBaseUrl}
                onChange={(event) => setSettingsBaseUrl(event.target.value)}
                placeholder="https://api.deepseek.com"
              />
            </label>

            <label className="field">
              <span>DeepSeek API Key</span>
              <input
                value={settingsApiKey}
                onChange={(event) => setSettingsApiKey(event.target.value)}
                placeholder={
                  settings?.apiKeyConfigured
                    ? `已保存 ${settings.maskedApiKey}, 留空保持不变`
                    : '粘贴 DeepSeek API Key'
                }
                type="password"
              />
            </label>

            <div className="settings-status">
              {settings?.apiKeyConfigured
                ? `当前已配置 ${settings.maskedApiKey}`
                : '当前未配置 API Key, 会使用本地规则生成'}
            </div>

            <div className="modal-actions">
              {settings?.apiKeyConfigured ? (
                <button
                  className="danger-button"
                  type="button"
                  disabled={isSavingSettings}
                  onClick={() => void handleClearApiKey()}
                >
                  清空密钥
                </button>
              ) : null}
              <button type="button" onClick={() => setIsSettingsOpen(false)}>
                取消
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isSavingSettings}
                onClick={() => void handleSaveSettings()}
              >
                {isSavingSettings ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
                保存设置
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function getPlatformName(platformId: PlatformId): string {
  return PLATFORM_ADAPTERS.find((adapter) => adapter.id === platformId)?.displayName ?? platformId;
}

function getPublishModeLabel(mode: PublishMode): string {
  const labels: Record<PublishMode, string> = {
    simulated: '模拟发布',
    exportOnly: '导出内容',
    officialApi: '官方接口',
    browserAssist: '浏览器辅助',
  };
  return labels[mode];
}

function getPublishModeIcon(mode: PublishMode) {
  if (mode === 'exportOnly') {
    return <Download size={16} />;
  }
  if (mode === 'simulated') {
    return <Play size={16} />;
  }
  return <Send size={16} />;
}

function sanitizeDraftPreviewHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ADD_ATTR: ['target', 'rel'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  });
}

function areDraftsEqual(left: PlatformDraft, right: PlatformDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
