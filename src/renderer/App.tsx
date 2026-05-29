import {
  Activity,
  Check,
  Clipboard,
  Download,
  Eye,
  History,
  Loader2,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  applyDraftValidation,
  createLocalDrafts,
  formatDraftForClipboard,
  PLATFORM_ADAPTERS,
} from '../shared/platformAdapters';
import { PLATFORM_ACCOUNT_SCHEMAS } from '../shared/platformAccounts';
import { createDraftPreviewHtml } from './previewMarkup';
import { createPublishReadiness, type PublishReadinessItem } from './publishReadiness';
import { createPublishTimeline, type PublishTimelineItem } from './publishTimeline';
import { createReadinessSteps } from './productStatus';
import {
  type ContentReviewIssue,
  type ContentReviewStatus,
  type PlatformAccountConfig,
  type PlatformDraft,
  type PlatformId,
  type PublishMode,
  type SavedSession,
  type SessionSummary,
} from '../shared/types';

const INITIAL_BODY = `把你的原始内容粘贴到这里。

PostPilot 会生成公众号, 知乎, B 站, 小红书四个平台版本。

第一版默认保存历史, 并支持复制, 导出和模拟发布。`;

const SIDEBAR_WIDTH = 280;
const MIN_WORKSPACE_WIDTH = 460;
const PREVIEW_MIN_WIDTH = 340;
const PREVIEW_MAX_WIDTH = 760;
const RESIZER_WIDTH = 8;

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<SavedSession | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('wechat');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(INITIAL_BODY);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isReviewingContent, setIsReviewingContent] = useState(false);
  const [isRewritingContent, setIsRewritingContent] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [currentView, setCurrentView] = useState<'editor' | 'settings'>('editor');
  const [isSavingAccount, setIsSavingAccount] = useState<PlatformId | null>(null);
  const [isVerifyingAccount, setIsVerifyingAccount] = useState<PlatformId | null>(null);
  const [accountConfigs, setAccountConfigs] = useState<PlatformAccountConfig[]>([]);
  const [accountForms, setAccountForms] = useState<
    Partial<Record<PlatformId, Record<string, string>>>
  >({});
  const [draftEdits, setDraftEdits] = useState<Partial<Record<PlatformId, PlatformDraft>>>({});
  const [draftViewMode, setDraftViewMode] = useState<'edit' | 'preview'>('preview');
  const [notice, setNotice] = useState('');
  const [previewWidth, setPreviewWidth] = useState(() => getDefaultPreviewWidth());

  useEffect(() => {
    window.postPilot.getBootstrap().then((payload) => {
      setSessions(payload.sessions);
      setAccountConfigs(payload.accountConfigs);
    });
  }, []);

  useEffect(() => {
    function handleResize() {
      setPreviewWidth((current) => clampPreviewWidth(current));
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  const selectedAccountConfig = useMemo(
    () => accountConfigs.find((config) => config.platformId === selectedPlatform) ?? null,
    [accountConfigs, selectedPlatform],
  );

  const selectedPublishEvents = useMemo(
    () =>
      currentSession?.publishEvents.filter(
        (event) => event.platformId === selectedPlatform,
      ) ?? [],
    [currentSession?.publishEvents, selectedPlatform],
  );

  const contentReview = currentSession?.contentReview ?? null;

  const selectedReviewIssues = useMemo(() => {
    return (
      contentReview?.issues.filter(
        (issue) => !issue.platformId || issue.platformId === selectedPlatform,
      ) ?? []
    );
  }, [contentReview, selectedPlatform]);

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

  const readinessSteps = useMemo(() => {
    if (!editableDraft) {
      return [];
    }
    return createReadinessSteps({
      draft: editableDraft,
      account: selectedAccountConfig,
      contentReview,
      publishEvents: selectedPublishEvents,
    });
  }, [contentReview, editableDraft, selectedAccountConfig, selectedPublishEvents]);

  const approvedDraftCount = useMemo(
    () =>
      previewDrafts.filter((draft) => {
        const edited = draftEdits[draft.platformId] ?? draft;
        return edited.status === 'ready';
      }).length,
    [draftEdits, previewDrafts],
  );

  const allDraftsReady = approvedDraftCount === PLATFORM_ADAPTERS.length;

  const publishTimeline = useMemo(
    () =>
      createPublishTimeline({
        session: currentSession,
        adapters: PLATFORM_ADAPTERS,
      }),
    [currentSession],
  );

  const publishReadiness = useMemo(
    () =>
      createPublishReadiness({
        session: currentSession,
        adapters: PLATFORM_ADAPTERS,
        accounts: accountConfigs,
      }),
    [accountConfigs, currentSession],
  );

  const legalIssueCount =
    contentReview?.issues.filter((issue) => issue.kind === 'legal').length ?? 0;
  const valuesIssueCount =
    contentReview?.issues.filter((issue) => issue.kind === 'values').length ?? 0;
  const contentReviewHasIssues = (contentReview?.issues.length ?? 0) > 0;
  const contentReviewAllowsPublish = Boolean(contentReview) && contentReview?.status !== 'blocked';
  const canRunPublishAll = allDraftsReady && contentReviewAllowsPublish && publishReadiness.canRunPublishAll;
  const shellStyle = {
    '--preview-width': `${previewWidth}px`,
  } as CSSProperties;

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

  async function refreshAccountConfigs() {
    setAccountConfigs(await window.postPilot.listAccountConfigs());
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

  async function handleRunContentReview() {
    if (!currentSession) {
      setNotice('请先生成并保存一次平台版本, 再进行内容审查');
      return;
    }

    setIsReviewingContent(true);
    setNotice('正在进行内容法律和价值观审查');

    try {
      const sessionForReview = await persistChangedDrafts(currentSession);
      const reviewed = await window.postPilot.runContentReview({
        sessionId: sessionForReview.id,
      });
      setCurrentSession(reviewed);
      setDraftEdits({});
      await refreshSessions();
      setNotice(reviewed.contentReview?.message ?? '内容审查已完成');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '内容审查失败');
    } finally {
      setIsReviewingContent(false);
    }
  }

  async function handleRewriteContentRisks() {
    if (!currentSession || !contentReviewHasIssues) {
      setNotice('请先完成内容审查并确认存在风险项');
      return;
    }

    setIsRewritingContent(true);
    setNotice('正在优化风险表达');

    try {
      const sessionForRewrite = await persistChangedDrafts(currentSession);
      if (!sessionForRewrite.contentReview?.issues.length) {
        throw new Error('请先完成内容审查');
      }

      const rewritten = await window.postPilot.rewriteContentRisks({
        sessionId: sessionForRewrite.id,
      });
      setCurrentSession(rewritten);
      setDraftEdits({});
      setDraftViewMode('preview');
      await refreshSessions();
      setNotice('风险表达已优化, 请重新审核平台草稿并再次进行内容审查');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '风险表达优化失败');
    } finally {
      setIsRewritingContent(false);
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

  function handlePreviewResizeStart() {
    document.body.classList.add('is-resizing-preview');

    function handlePointerMove(event: PointerEvent) {
      setPreviewWidth(clampPreviewWidth(window.innerWidth - event.clientX));
    }

    function handlePointerUp() {
      document.body.classList.remove('is-resizing-preview');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
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

  async function handlePublishAll() {
    if (!currentSession) {
      setNotice('请先生成并保存一次平台版本');
      return;
    }

    setIsPublishing(true);
    try {
      const sessionForPublish = await persistChangedDrafts(currentSession);
      let updated: SavedSession | null = sessionForPublish;
      const publishableDrafts = sessionForPublish.drafts.filter((draft) =>
        publishReadiness.publishablePlatformIds.includes(draft.platformId),
      );
      if (publishableDrafts.length === 0) {
        throw new Error('当前没有可通过官方接口发布的平台');
      }

      for (const draft of publishableDrafts) {
        const result = await window.postPilot.runPublishTask({
          sessionId: sessionForPublish.id,
          platformId: draft.platformId,
          mode: 'officialApi',
        });
        updated = result.session;
      }
      if (updated) {
        setCurrentSession(updated);
      }
      await refreshSessions();
      setNotice(`已执行 ${publishableDrafts.length} 个官方接口发布任务`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '真实发布失败');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleSaveAccount(platformId: PlatformId) {
    setIsSavingAccount(platformId);
    try {
      const currentConfig = accountConfigs.find((config) => config.platformId === platformId);
      const form = accountForms[platformId] ?? {};
      const { enabled, ...fields } = form;
      const saved = await window.postPilot.saveAccountConfig({
        platformId,
        enabled: enabled ? enabled === 'true' : currentConfig?.enabled ?? true,
        fields,
      });
      setAccountConfigs((current) =>
        current.map((config) => (config.platformId === platformId ? saved : config)),
      );
      setAccountForms((current) => ({
        ...current,
        [platformId]: {},
      }));
      setNotice(`${getPlatformName(platformId)}账号配置已保存`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存账号配置失败');
    } finally {
      setIsSavingAccount(null);
    }
  }

  async function handleVerifyAccount(platformId: PlatformId) {
    setIsVerifyingAccount(platformId);
    try {
      const result = await window.postPilot.verifyAccountConfig({
        platformId,
      });
      await refreshAccountConfigs();
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '授权校验失败');
    } finally {
      setIsVerifyingAccount(null);
    }
  }

  async function handleDeleteAccount(platformId: PlatformId) {
    try {
      const configs = await window.postPilot.deleteAccountConfig(platformId);
      setAccountConfigs(configs);
      setAccountForms((current) => ({
        ...current,
        [platformId]: {},
      }));
      setNotice(`${getPlatformName(platformId)}账号配置已删除`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除账号配置失败');
    }
  }

  function updateAccountField(platformId: PlatformId, key: string, value: string) {
    setAccountForms((current) => ({
      ...current,
      [platformId]: {
        ...current[platformId],
        [key]: value,
      },
    }));
  }

  function updateDraftEdit(patch: Partial<PlatformDraft>, resetReview = true) {
    if (!editableDraft) {
      return;
    }
    const nextDraft = {
      ...editableDraft,
      ...patch,
      status: patch.status === 'ready' || !resetReview ? patch.status ?? editableDraft.status : 'needs-review',
    };
    setDraftEdits((current) => ({
      ...current,
      [editableDraft.platformId]: applyDraftValidation(nextDraft),
    }));
    if (resetReview) {
      setCurrentSession((current) =>
        current?.contentReview ? { ...current, contentReview: undefined } : current,
      );
    }
  }

  async function handleApproveDraft() {
    if (!editableDraft) {
      return;
    }
    const approved = applyDraftValidation({
      ...editableDraft,
      status: 'ready',
    });
    if (approved.status !== 'ready') {
      setNotice('请先修复平台草稿问题');
      return;
    }

    setDraftEdits((current) => ({
      ...current,
      [approved.platformId]: approved,
    }));

    if (!currentSession) {
      setNotice('审核已通过');
      return;
    }

    setIsSavingDraft(true);
    try {
      const saved = await window.postPilot.updateDraft({
        sessionId: currentSession.id,
        draft: approved,
      });
      setCurrentSession(saved);
      await refreshSessions();
      setNotice(`${getPlatformName(approved.platformId)}审核已通过`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存审核状态失败');
    } finally {
      setIsSavingDraft(false);
    }
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

  function renderSettingsView() {
    const configuredCount = accountConfigs.filter((config) => config.configured).length;
    const authorizedCount = accountConfigs.filter(
      (config) => config.status === 'authorized',
    ).length;
    const missingCount = PLATFORM_ADAPTERS.length - configuredCount;

    return (
      <section className="settings-page">
        <div className="settings-summary">
          <div>
            <span>已授权</span>
            <strong>{authorizedCount}</strong>
          </div>
          <div>
            <span>已配置</span>
            <strong>{configuredCount}</strong>
          </div>
          <div>
            <span>未配置</span>
            <strong>{missingCount}</strong>
          </div>
        </div>

        <div className="settings-grid">
          {PLATFORM_ADAPTERS.map((adapter) => {
            const schema = PLATFORM_ACCOUNT_SCHEMAS[adapter.id];
            const config =
              accountConfigs.find((item) => item.platformId === adapter.id) ??
              createFallbackAccountConfig(adapter.id);
            const form = accountForms[adapter.id] ?? {};

            return (
              <section className="account-card" key={adapter.id}>
                <div className="account-heading">
                  <div>
                    <h2>{adapter.displayName}</h2>
                    <span className={`account-state ${config.status}`}>{config.statusMessage}</span>
                  </div>
                  <label className="account-toggle">
                    <input
                      checked={form.enabled ? form.enabled === 'true' : config.enabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateAccountField(adapter.id, 'enabled', String(event.target.checked))
                      }
                    />
                    启用
                  </label>
                </div>

                {Object.keys(config.maskedFields).length > 0 ? (
                  <div className="account-saved-fields">
                    {Object.entries(config.maskedFields).map(([key, value]) => (
                      <span key={key}>
                        {getAccountFieldLabel(adapter.id, key)}: {value}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="account-fields">
                  {schema.fields.map((field) => (
                    <label className="field" key={field.key}>
                      <span>{field.label}</span>
                      {field.kind === 'select' ? (
                        <select
                          value={form[field.key] ?? ''}
                          onChange={(event) =>
                            updateAccountField(adapter.id, field.key, event.target.value)
                          }
                        >
                          <option value="">保持当前</option>
                          {field.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={form[field.key] ?? ''}
                          type={field.kind === 'password' ? 'password' : 'text'}
                          placeholder={config.maskedFields[field.key] || field.label}
                          onChange={(event) =>
                            updateAccountField(adapter.id, field.key, event.target.value)
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>

                <div className="account-actions">
                  <button
                    type="button"
                    disabled={isSavingAccount === adapter.id}
                    onClick={() => void handleSaveAccount(adapter.id)}
                  >
                    {isSavingAccount === adapter.id ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    保存配置
                  </button>
                  <button
                    type="button"
                    disabled={isVerifyingAccount === adapter.id || !config.configured}
                    onClick={() => void handleVerifyAccount(adapter.id)}
                  >
                    {isVerifyingAccount === adapter.id ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    授权
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={!config.configured}
                    onClick={() => void handleDeleteAccount(adapter.id)}
                  >
                    <Trash2 size={16} />
                    删除配置
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div
      className={`app-shell ${currentView === 'settings' ? 'settings-mode' : ''}`}
      style={shellStyle}
    >
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
            <p className="empty-text">暂无历史</p>
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

        <button
          className={`sidebar-settings ${currentView === 'settings' ? 'active' : ''}`}
          type="button"
          onClick={() => setCurrentView(currentView === 'settings' ? 'editor' : 'settings')}
        >
          <Settings size={16} />
          设置
        </button>
      </aside>

      <main className={currentView === 'settings' ? 'workspace settings-workspace' : 'workspace'}>
        <header className="topbar">
          <div>
            <h1>{currentView === 'settings' ? '设置' : '多平台内容适配'}</h1>
          </div>
        </header>

        {currentView === 'settings' ? (
          renderSettingsView()
        ) : (
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
          <div className="editor-meta">
            <span>已审核 {approvedDraftCount}/{PLATFORM_ADAPTERS.length}</span>
            <span>{currentSession ? '已保存' : '本地草稿'}</span>
          </div>
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
        )}
      </main>

      {currentView === 'editor' ? (
      <button
        className="pane-resizer"
        type="button"
        aria-label="调整右侧预览宽度"
        aria-orientation="vertical"
        onPointerDown={handlePreviewResizeStart}
      />
      ) : null}

      {currentView === 'editor' ? (
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
            <div className="readiness-panel">
              {readinessSteps.map((step) => (
                <div className={`readiness-step ${step.state}`} key={step.id}>
                  <span>{step.label}</span>
                  <strong>{step.text}</strong>
                </div>
              ))}
            </div>

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
                {editableDraft.status === 'ready' ? <Check size={14} /> : <X size={14} />}
                {editableDraft.status === 'ready' ? '可发布' : '待审核'}
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

            <section className={`content-review-card ${contentReview?.status ?? 'not-reviewed'}`}>
              <div className="content-review-heading">
                <div>
                  <span>内容审查</span>
                  <strong>{getContentReviewStatusText(contentReview?.status)}</strong>
                </div>
                <div className="content-review-actions">
                  <button
                    type="button"
                    disabled={isReviewingContent || isRewritingContent || !currentSession}
                    onClick={() => void handleRunContentReview()}
                  >
                    {isReviewingContent ? (
                      <Loader2 className="spin" size={15} />
                    ) : contentReview?.status === 'passed' ? (
                      <ShieldCheck size={15} />
                    ) : (
                      <ShieldAlert size={15} />
                    )}
                    AI 审查
                  </button>
                  <button
                    className="rewrite-risk-button"
                    type="button"
                    disabled={
                      isRewritingContent ||
                      isReviewingContent ||
                      !currentSession ||
                      !contentReviewHasIssues
                    }
                    onClick={() => void handleRewriteContentRisks()}
                  >
                    {isRewritingContent ? (
                      <Loader2 className="spin" size={15} />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    一键优化
                  </button>
                </div>
              </div>
              <div className="content-review-metrics">
                <span className="legal">法律 {legalIssueCount}</span>
                <span className="values">价值观 {valuesIssueCount}</span>
              </div>
              {contentReviewHasIssues ? (
                <p className="review-hint">优化后会回到待审核, 需要人工确认并重新审查</p>
              ) : null}
              {contentReview ? (
                selectedReviewIssues.length > 0 ? (
                  <div className="content-review-issues">
                    {selectedReviewIssues.slice(0, 4).map((issue) => (
                      <article className={`content-review-issue ${issue.kind}`} key={issue.id}>
                        <div>
                          <span>{getReviewIssueKindLabel(issue.kind)}</span>
                          <strong>{issue.snippet}</strong>
                        </div>
                        <p>{issue.reason}</p>
                        <small>{issue.suggestion}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="review-empty">当前平台未发现明显风险</p>
                )
              ) : (
                <p className="review-empty">发布前先完成内容法律和价值观审查</p>
              )}
            </section>

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
                disabled={isSavingDraft || editableDraft.status === 'ready'}
                onClick={() => void handleApproveDraft()}
              >
                {isSavingDraft ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
                审核通过
              </button>
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
                    disabled={
                      isPublishing ||
                      (mode !== 'exportOnly' &&
                        (editableDraft.status !== 'ready' || !contentReviewAllowsPublish))
                    }
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

        <section className="publish-dashboard">
          <div className="publish-dashboard-heading">
            <div>
              <span>发布任务中心</span>
              <strong>{publishTimeline.summary.progress}%</strong>
            </div>
            <Activity size={16} />
          </div>
          <div className="publish-progress" aria-hidden="true">
            <span style={{ width: `${publishTimeline.summary.progress}%` }} />
          </div>
          <div className="publish-summary-grid">
            <span>完成 {publishTimeline.summary.success}</span>
            <span>失败 {publishTimeline.summary.failed}</span>
            <span>等待 {publishTimeline.summary.ready + publishTimeline.summary.blocked}</span>
          </div>
          <div className="publish-readiness-list">
            {publishReadiness.items.map((item) => (
              <div className={`publish-readiness-item ${item.state}`} key={item.id}>
                <div>
                  {getPublishReadinessIcon(item)}
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <small>{item.action}</small>
              </div>
            ))}
          </div>
          <div className="publish-task-list">
            {publishTimeline.items.map((item) => (
              <div className={`publish-task ${item.status}`} key={item.platformId}>
                <div className="publish-task-main">
                  <div className="publish-task-title">
                    {getPublishTimelineIcon(item)}
                    <span>{item.platformName}</span>
                    <strong>{item.label}</strong>
                  </div>
                  <p>{item.message}</p>
                  <small>
                    {getPublishModeLabel(item.mode)}
                    {item.attempts > 0 ? ` · ${item.attempts} 次` : ''}
                    {item.updatedAt ? ` · ${formatTime(item.updatedAt)}` : ''}
                  </small>
                </div>
                {item.canRetry ? (
                  <button
                    type="button"
                    disabled={isPublishing}
                    onClick={() => void handleRunPublishTask(item.platformId, item.mode)}
                  >
                    <RotateCcw size={14} />
                    重试
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <button
          className="publish-all"
          type="button"
          disabled={isPublishing || !currentSession || !canRunPublishAll}
          onClick={() => void handlePublishAll()}
        >
          <Send size={16} />
          一键发布已接入平台
        </button>
      </aside>
      ) : null}

      {notice ? <div className="toast">{notice}</div> : null}
    </div>
  );
}

function getDefaultPreviewWidth(): number {
  if (typeof window === 'undefined') {
    return 430;
  }
  return clampPreviewWidth(Math.round(window.innerWidth * 0.25));
}

function clampPreviewWidth(value: number): number {
  if (typeof window === 'undefined') {
    return value;
  }
  const maxByViewport =
    window.innerWidth - SIDEBAR_WIDTH - MIN_WORKSPACE_WIDTH - RESIZER_WIDTH;
  return Math.max(PREVIEW_MIN_WIDTH, Math.min(value, PREVIEW_MAX_WIDTH, maxByViewport));
}

function getPlatformName(platformId: PlatformId): string {
  return PLATFORM_ADAPTERS.find((adapter) => adapter.id === platformId)?.displayName ?? platformId;
}

function createFallbackAccountConfig(platformId: PlatformId): PlatformAccountConfig {
  return {
    platformId,
    enabled: false,
    configured: false,
    status: 'not-configured',
    statusMessage: '未配置账号',
    maskedFields: {},
  };
}

function getAccountFieldLabel(platformId: PlatformId, key: string): string {
  return (
    PLATFORM_ACCOUNT_SCHEMAS[platformId].fields.find((field) => field.key === key)?.label ?? key
  );
}

function getContentReviewStatusText(status?: ContentReviewStatus): string {
  if (status === 'passed') {
    return '已通过';
  }
  if (status === 'needs-attention') {
    return '需人工确认';
  }
  if (status === 'blocked') {
    return '已拦截';
  }
  return '待审查';
}

function getReviewIssueKindLabel(kind: ContentReviewIssue['kind']): string {
  return kind === 'legal' ? '法律风险' : '价值观风险';
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

function getPublishTimelineIcon(item: PublishTimelineItem) {
  if (item.status === 'success') {
    return <Check size={14} />;
  }
  if (item.status === 'failed' || item.status === 'blocked') {
    return <X size={14} />;
  }
  if (item.status === 'pending') {
    return <Loader2 className="spin" size={14} />;
  }
  return <Send size={14} />;
}

function getPublishReadinessIcon(item: PublishReadinessItem) {
  if (item.state === 'done') {
    return <Check size={14} />;
  }
  if (item.state === 'warning') {
    return <ShieldAlert size={14} />;
  }
  return <X size={14} />;
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
