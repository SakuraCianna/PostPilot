import {
  ArrowLeft,
  Check,
  Clipboard,
  ExternalLink,
  History,
  Loader2,
  Monitor,
  Play,
  Plus,
  Save,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from './components/AppIcon';
import {
  createCustomPlatformAdapters,
  formatDraftForClipboard,
  PLATFORM_ADAPTERS,
} from '../shared/platformAdapters';
import { PLATFORM_ACCOUNT_SCHEMAS } from '../shared/platformAccounts';
import { createDraftPreviewHtml } from './previewMarkup';
import {
  type BuiltInPlatformId,
  type ContentReviewIssue,
  type ContentReviewStatus,
  type PlatformAccountConfig,
  type PlatformDraft,
  type PlatformId,
  type SavedSession,
  type SessionSummary,
} from '../shared/types';

const INITIAL_BODY = `把你的原始内容粘贴到这里。

PostPilot 会生成微信公众号, 哔哩哔哩, 抖音三个内置平台版本。

第一版默认保存历史, 并支持复制和模拟发布。`;

const NOTICE_TTL_MS = 3000;

const PLATFORM_CONFIG_LINKS: Record<
  BuiltInPlatformId,
  Array<{ label: string; url: string }>
> = {
  wechat: [
    { label: '创作后台', url: 'https://mp.weixin.qq.com/' },
    { label: '公众号平台', url: 'https://mp.weixin.qq.com/' },
  ],
  bilibili: [{ label: '开放平台', url: 'https://openhome.bilibili.com/doc' }],
  douyin: [{ label: '创作服务', url: 'https://creator.douyin.com/' }],
};

type AppView = 'editor' | 'results' | 'settings';
type PublishProgress = PlatformId | 'all' | null;

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<SavedSession | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('wechat');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(INITIAL_BODY);
  const [currentView, setCurrentView] = useState<AppView>('editor');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReviewingContent, setIsReviewingContent] = useState(false);
  const [isRewritingContent, setIsRewritingContent] = useState(false);
  const [publishingPlatform, setPublishingPlatform] = useState<PublishProgress>(null);
  const [isSavingAccount, setIsSavingAccount] = useState<string | null>(null);
  const [accountConfigs, setAccountConfigs] = useState<PlatformAccountConfig[]>([]);
  const [accountForms, setAccountForms] = useState<Partial<Record<string, Record<string, string>>>>(
    {},
  );
  const [customPlatformDrafts, setCustomPlatformDrafts] = useState<
    Array<{ platformId: string; displayName: string }>
  >([]);
  const [newCustomPlatform, setNewCustomPlatform] = useState({
    platformId: '',
    displayName: '',
  });
  const [customAccountFields, setCustomAccountFields] = useState<
    Partial<Record<string, Array<{ id: string; key: string; value: string }>>>
  >({});
  const [notice, setNotice] = useState('');

  const activePlatformAdapters = useMemo(
    () => [...PLATFORM_ADAPTERS, ...createCustomPlatformAdapters(accountConfigs)],
    [accountConfigs],
  );

  useEffect(() => {
    window.postPilot.getBootstrap().then((payload) => {
      setSessions(payload.sessions);
      setAccountConfigs(payload.accountConfigs);
    });
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(''), NOTICE_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const resultDrafts = useMemo(() => {
    if (!currentSession) {
      return [];
    }

    return currentSession.drafts.filter((draft) =>
      activePlatformAdapters.some((adapter) => adapter.id === draft.platformId),
    );
  }, [activePlatformAdapters, currentSession]);

  useEffect(() => {
    const selectedExists = resultDrafts.some((draft) => draft.platformId === selectedPlatform);
    if (!selectedExists && resultDrafts[0]) {
      setSelectedPlatform(resultDrafts[0].platformId);
    }
  }, [resultDrafts, selectedPlatform]);

  const selectedDraft =
    resultDrafts.find((draft) => draft.platformId === selectedPlatform) ?? resultDrafts[0] ?? null;

  const selectedAdapter = useMemo(
    () =>
      activePlatformAdapters.find(
        (adapter) => adapter.id === (selectedDraft?.platformId ?? selectedPlatform),
      ) ?? null,
    [activePlatformAdapters, selectedDraft?.platformId, selectedPlatform],
  );

  const publishStatusByPlatform = useMemo(() => {
    const map = new Map<PlatformId, SavedSession['publishEvents'][number]>();
    const events = [...(currentSession?.publishEvents ?? [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    for (const event of events) {
      if (!map.has(event.platformId)) {
        map.set(event.platformId, event);
      }
    }

    return map;
  }, [currentSession?.publishEvents]);

  const selectedPublishEvent = selectedDraft
    ? publishStatusByPlatform.get(selectedDraft.platformId)
    : undefined;

  const contentReview = currentSession?.contentReview ?? null;
  const selectedReviewIssues = useMemo(() => {
    return (
      contentReview?.issues.filter(
        (issue) => !issue.platformId || issue.platformId === selectedPlatform,
      ) ?? []
    );
  }, [contentReview, selectedPlatform]);
  const legalIssueCount =
    contentReview?.issues.filter((issue) => issue.kind === 'legal').length ?? 0;
  const valuesIssueCount =
    contentReview?.issues.filter((issue) => issue.kind === 'values').length ?? 0;
  const contentReviewHasIssues = (contentReview?.issues.length ?? 0) > 0;
  const contentReviewAllowsPublish = Boolean(contentReview) && contentReview?.status !== 'blocked';
  const isPublishing = publishingPlatform !== null;

  const draftPreviewHtml = useMemo(() => {
    if (!selectedDraft || !selectedAdapter) {
      return '';
    }

    return createDraftPreviewHtml(
      selectedDraft,
      selectedAdapter.exportFormat,
      sanitizeDraftPreviewHtml,
    );
  }, [selectedAdapter, selectedDraft]);

  const generatedDraftCount = resultDrafts.length;
  const publishStats = useMemo(() => {
    return resultDrafts.reduce(
      (stats, draft) => {
        const event = publishStatusByPlatform.get(draft.platformId);
        if (event?.status === 'success') {
          stats.success += 1;
        } else if (event?.status === 'failed') {
          stats.failed += 1;
        } else {
          stats.waiting += 1;
        }
        return stats;
      },
      { success: 0, failed: 0, waiting: 0 },
    );
  }, [publishStatusByPlatform, resultDrafts]);

  async function refreshSessions() {
    setSessions(await window.postPilot.listSessions());
  }

  async function refreshAccountConfigs() {
    setAccountConfigs(await window.postPilot.listAccountConfigs());
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setNotice('正在生成平台版本');

    try {
      const saved = await window.postPilot.generateAdaptations({
        sessionId: currentSession?.id,
        title,
        body,
      });
      setCurrentSession(saved);
      setTitle(saved.title);
      setBody(saved.sourceBody);
      setSelectedPlatform(saved.drafts[0]?.platformId ?? 'wechat');
      setCurrentView('results');
      await refreshSessions();
      setNotice(saved.modelMessage || '平台版本已生成');
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
      const reviewed = await window.postPilot.runContentReview({
        sessionId: currentSession.id,
      });
      setCurrentSession(reviewed);
      setCurrentView('results');
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
      const rewritten = await window.postPilot.rewriteContentRisks({
        sessionId: currentSession.id,
      });
      setCurrentSession(rewritten);
      setCurrentView('results');
      await refreshSessions();
      setNotice('风险表达已优化, 请重新进行内容审查');
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
    setSelectedPlatform(loaded.drafts[0]?.platformId ?? 'wechat');
    setCurrentView('results');
    setNotice(loaded.modelMessage);
  }

  function handleNewSession() {
    setCurrentSession(null);
    setTitle('');
    setBody('');
    setSelectedPlatform('wechat');
    setCurrentView('editor');
    setNotice('已创建新的本地草稿');
  }

  async function handleCopy(draft: PlatformDraft) {
    const adapter = activePlatformAdapters.find((item) => item.id === draft.platformId);
    await navigator.clipboard.writeText(formatDraftForClipboard(draft, adapter));
    setNotice(`已复制 ${getPlatformName(draft.platformId, activePlatformAdapters)} 版本`);
  }

  async function handleRunPublishTask(platformId: PlatformId) {
    if (!currentSession) {
      setNotice('请先生成并保存一次平台版本');
      return;
    }
    if (!contentReview) {
      setNotice('请先完成 AI 内容审查');
      return;
    }
    if (contentReview.status === 'blocked') {
      setNotice('内容审查已拦截, 请先优化风险表达');
      return;
    }

    setPublishingPlatform(platformId);
    try {
      const result = await window.postPilot.runPublishTask({
        sessionId: currentSession.id,
        platformId,
        mode: 'simulated',
      });
      if (result.session) {
        setCurrentSession(result.session);
      }
      await refreshSessions();
      setNotice(result.task.event.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模拟发布失败');
    } finally {
      setPublishingPlatform(null);
    }
  }

  async function handlePublishAll() {
    if (!currentSession) {
      setNotice('请先生成并保存一次平台版本');
      return;
    }
    if (!contentReview) {
      setNotice('请先完成 AI 内容审查');
      return;
    }
    if (contentReview.status === 'blocked') {
      setNotice('内容审查已拦截, 请先优化风险表达');
      return;
    }
    if (resultDrafts.length === 0) {
      setNotice('当前没有可模拟发布的平台版本');
      return;
    }

    setPublishingPlatform('all');
    try {
      let updated: SavedSession | null = currentSession;
      for (const draft of resultDrafts) {
        const result = await window.postPilot.runPublishTask({
          sessionId: currentSession.id,
          platformId: draft.platformId,
          mode: 'simulated',
        });
        updated = result.session;
      }
      if (updated) {
        setCurrentSession(updated);
      }
      await refreshSessions();
      setNotice(`已完成 ${resultDrafts.length} 个平台的模拟发布`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模拟发布失败');
    } finally {
      setPublishingPlatform(null);
    }
  }

  async function handleSaveAccount(platformId: string, displayName?: string) {
    setIsSavingAccount(platformId);
    try {
      const currentConfig = accountConfigs.find((config) => config.platformId === platformId);
      const form = accountForms[platformId] ?? {};
      const { enabled, ...fields } = form;
      const customFields = Object.fromEntries(
        (customAccountFields[platformId] ?? [])
          .map((field) => [field.key.trim(), field.value.trim()])
          .filter(([key, value]) => key && value),
      );
      const saved = await window.postPilot.saveAccountConfig({
        platformId,
        displayName: displayName ?? currentConfig?.displayName,
        enabled: enabled ? enabled === 'true' : currentConfig?.enabled ?? true,
        fields: {
          ...fields,
          ...customFields,
        },
      });
      setAccountConfigs((current) =>
        current.some((config) => config.platformId === platformId)
          ? current.map((config) => (config.platformId === platformId ? saved : config))
          : [...current, saved],
      );
      setAccountForms((current) => ({ ...current, [platformId]: {} }));
      setCustomAccountFields((current) => ({ ...current, [platformId]: [] }));
      setCustomPlatformDrafts((current) =>
        current.filter((draft) => draft.platformId !== platformId),
      );

      if (!saved.builtIn) {
        const preset = await window.postPilot.researchPlatformPreset({
          platformId,
          displayName: saved.displayName,
        });
        setNotice(`${saved.displayName}配置已保存, ${preset.message}`);
        return;
      }

      setNotice(`${getAccountDisplayName(platformId, saved.displayName)}平台配置已保存`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存账号配置失败');
    } finally {
      setIsSavingAccount(null);
    }
  }

  async function handleDeleteAccount(platformId: string) {
    try {
      const configs = await window.postPilot.deleteAccountConfig(platformId);
      setAccountConfigs(configs);
      setAccountForms((current) => ({ ...current, [platformId]: {} }));
      setCustomAccountFields((current) => ({ ...current, [platformId]: [] }));
      setCustomPlatformDrafts((current) =>
        current.filter((draft) => draft.platformId !== platformId),
      );
      await refreshAccountConfigs();
      setNotice(`${getAccountDisplayName(platformId)}平台配置已删除`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除账号配置失败');
    }
  }

  function updateAccountField(platformId: string, key: string, value: string) {
    setAccountForms((current) => ({
      ...current,
      [platformId]: {
        ...current[platformId],
        [key]: value,
      },
    }));
  }

  function addCustomPlatform() {
    const platformId = normalizeCustomPlatformId(newCustomPlatform.platformId);
    const displayName = newCustomPlatform.displayName.trim();

    if (!displayName || !platformId) {
      setNotice('请填写自定义平台名称和平台标识');
      return;
    }
    if (
      PLATFORM_ADAPTERS.some((adapter) => adapter.id === platformId) ||
      accountConfigs.some((config) => config.platformId === platformId) ||
      customPlatformDrafts.some((draft) => draft.platformId === platformId)
    ) {
      setNotice('平台标识已存在');
      return;
    }

    setCustomPlatformDrafts((current) => [...current, { platformId, displayName }]);
    setNewCustomPlatform({ platformId: '', displayName: '' });
    setNotice('已添加自定义平台配置卡片');
  }

  function removeCustomPlatformDraft(platformId: string) {
    setCustomPlatformDrafts((current) =>
      current.filter((draft) => draft.platformId !== platformId),
    );
    setCustomAccountFields((current) => ({ ...current, [platformId]: [] }));
  }

  function addCustomAccountField(platformId: string) {
    setCustomAccountFields((current) => ({
      ...current,
      [platformId]: [
        ...(current[platformId] ?? []),
        {
          id: crypto.randomUUID(),
          key: '',
          value: '',
        },
      ],
    }));
  }

  function updateCustomAccountField(
    platformId: string,
    id: string,
    patch: Partial<{ key: string; value: string }>,
  ) {
    setCustomAccountFields((current) => ({
      ...current,
      [platformId]: (current[platformId] ?? []).map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
    }));
  }

  function removeCustomAccountField(platformId: string, id: string) {
    setCustomAccountFields((current) => ({
      ...current,
      [platformId]: (current[platformId] ?? []).filter((field) => field.id !== id),
    }));
  }

  function toggleSettingsView() {
    if (currentView === 'settings') {
      setCurrentView(currentSession ? 'results' : 'editor');
      return;
    }
    setCurrentView('settings');
  }

  function renderEditorView() {
    return (
      <section className="editor-pane">
        <input
          className="title-input"
          placeholder="标题"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setCurrentSession(null);
          }}
        />
        <textarea
          className="body-input"
          placeholder="输入或粘贴你的原始内容"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setCurrentSession(null);
          }}
        />
        <div className="editor-actions">
          <span>{body.length} 字符</span>
          <button
            className="primary-button generate-button"
            type="button"
            disabled={isGenerating || body.trim().length === 0}
            onClick={() => void handleGenerate()}
          >
            {isGenerating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            生成平台版本
          </button>
        </div>
      </section>
    );
  }

  function renderResultsView() {
    if (!currentSession || resultDrafts.length === 0) {
      return (
        <section className="empty-results">
          <Sparkles size={28} />
          <strong>还没有生成平台版本</strong>
          <button type="button" onClick={() => setCurrentView('editor')}>
            返回编辑
          </button>
        </section>
      );
    }

    return (
      <section className="results-page">
        <aside className="platform-list-panel">
          <div className="panel-heading">
            <span>平台版本</span>
            <strong>{generatedDraftCount}</strong>
          </div>
          <div className="platform-version-list">
            {resultDrafts.map((draft) => {
              const event = publishStatusByPlatform.get(draft.platformId);
              const adapter = activePlatformAdapters.find((item) => item.id === draft.platformId);
              const isActive = selectedDraft?.platformId === draft.platformId;
              return (
                <button
                  className={`platform-version-item ${isActive ? 'active' : ''}`}
                  key={draft.platformId}
                  type="button"
                  onClick={() => setSelectedPlatform(draft.platformId)}
                >
                  <strong>{adapter?.displayName ?? draft.platformId}</strong>
                  <span>{draft.title}</span>
                  <small className={event?.status ?? draft.status}>
                    {getPlatformListStateText(draft, event?.status)}
                  </small>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="result-detail">
          {selectedDraft ? (
            <>
              <div className="result-toolbar">
                <button type="button" onClick={() => setCurrentView('editor')}>
                  <ArrowLeft size={16} />
                  返回编辑
                </button>
                <button
                  type="button"
                  disabled={isReviewingContent || isRewritingContent}
                  onClick={() => void handleRunContentReview()}
                >
                  {isReviewingContent ? (
                    <Loader2 className="spin" size={16} />
                  ) : contentReview?.status === 'passed' ? (
                    <ShieldCheck size={16} />
                  ) : (
                    <ShieldAlert size={16} />
                  )}
                  AI 审查
                </button>
                <button
                  type="button"
                  disabled={isReviewingContent || isRewritingContent || !contentReviewHasIssues}
                  onClick={() => void handleRewriteContentRisks()}
                >
                  {isRewritingContent ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  优化风险表达
                </button>
                <button type="button" onClick={() => void handleCopy(selectedDraft)}>
                  <Clipboard size={16} />
                  复制
                </button>
                <button
                  className="dark-action"
                  type="button"
                  disabled={isPublishing || !contentReviewAllowsPublish}
                  onClick={() => void handleRunPublishTask(selectedDraft.platformId)}
                >
                  {publishingPlatform === selectedDraft.platformId ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  模拟发布
                </button>
                <button
                  className="dark-action"
                  type="button"
                  disabled={isPublishing || !contentReviewAllowsPublish}
                  onClick={() => void handlePublishAll()}
                >
                  {publishingPlatform === 'all' ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  全部模拟发布
                </button>
              </div>

              <div className="result-status-row">
                <div className={`review-pill ${contentReview?.status ?? 'not-reviewed'}`}>
                  {contentReview?.status === 'passed' ? <Check size={15} /> : <X size={15} />}
                  {getContentReviewStatusText(contentReview?.status)}
                </div>
                <div className="publish-pill">
                  模拟发布: {getPublishEventText(selectedPublishEvent)}
                </div>
                <div className="publish-pill">
                  完成 {publishStats.success} / 失败 {publishStats.failed} / 等待 {publishStats.waiting}
                </div>
              </div>

              {renderContentReviewCard()}

              <div className="version-layout">
                <article className="version-document">
                  <div className="section-kicker">生成版本</div>
                  <h2>{selectedDraft.title}</h2>
                  <p className="version-summary">{selectedDraft.summary || '暂无摘要'}</p>
                  {selectedDraft.warnings && selectedDraft.warnings.length > 0 ? (
                    <div className="warnings">
                      {selectedDraft.warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                      ))}
                    </div>
                  ) : null}
                  <pre>{selectedDraft.body}</pre>
                  <div className="tags">
                    {selectedDraft.hashtags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </article>

                <section className="device-previews">
                  <article className="device-card">
                    <div className="device-heading">
                      <Smartphone size={16} />
                      <span>手机端展示</span>
                    </div>
                    <div className="phone-frame">
                      <div className="phone-status" aria-hidden="true" />
                      <article
                        className="device-render phone-render"
                        dangerouslySetInnerHTML={{ __html: draftPreviewHtml }}
                      />
                    </div>
                  </article>

                  <article className="device-card">
                    <div className="device-heading">
                      <Monitor size={16} />
                      <span>PC 端预览</span>
                    </div>
                    <div className="desktop-frame">
                      <div className="desktop-bar" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                      <article
                        className="device-render desktop-render"
                        dangerouslySetInnerHTML={{ __html: draftPreviewHtml }}
                      />
                    </div>
                  </article>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-results">没有找到当前平台版本</div>
          )}
        </section>
      </section>
    );
  }

  function renderContentReviewCard() {
    return (
      <section className={`content-review-card ${contentReview?.status ?? 'not-reviewed'}`}>
        <div className="content-review-heading">
          <div>
            <span>AI 内容审查</span>
            <strong>{getContentReviewStatusText(contentReview?.status)}</strong>
          </div>
          <div className="content-review-metrics">
            <span className="legal">法律 {legalIssueCount}</span>
            <span className="values">价值观 {valuesIssueCount}</span>
          </div>
        </div>

        {contentReviewHasIssues ? (
          <p className="review-hint">法律风险会标红, 价值观风险会标黄。优化后需要重新审查。</p>
        ) : null}

        {contentReview ? (
          selectedReviewIssues.length > 0 ? (
            <div className="content-review-issues">
              {selectedReviewIssues.map((issue) => (
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
          <p className="review-empty">模拟发布前需要先完成 AI 内容审查</p>
        )}
      </section>
    );
  }

  function renderSettingsView() {
    const configuredCount = accountConfigs.filter((config) => config.configured).length;
    const customConfigs = accountConfigs.filter((config) => !config.builtIn);
    const builtInCards = PLATFORM_ADAPTERS.map((adapter) => {
      return (
        accountConfigs.find((config) => config.platformId === adapter.id) ??
        createFallbackAccountConfig(adapter.id)
      );
    });
    const customCards = [
      ...customConfigs,
      ...customPlatformDrafts.map((draft) =>
        createCustomFallbackAccountConfig(draft.platformId, draft.displayName),
      ),
    ];
    const accountCards = [...builtInCards, ...customCards];

    return (
      <section className="settings-page">
        <div className="settings-summary">
          <div>
            <span>已保存配置</span>
            <strong>{configuredCount}</strong>
          </div>
          <div>
            <span>内置平台</span>
            <strong>{PLATFORM_ADAPTERS.length}</strong>
          </div>
          <div>
            <span>自定义平台</span>
            <strong>{customConfigs.length}</strong>
          </div>
        </div>

        <section className="custom-platform-panel">
          <div>
            <strong>新增平台</strong>
            <span>Tavily 会生成平台风格 Markdown 预设</span>
          </div>
          <input
            placeholder="平台名称, 例如 小红书"
            value={newCustomPlatform.displayName}
            onChange={(event) =>
              setNewCustomPlatform((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
          <input
            placeholder="平台标识, 例如 xiaohongshu"
            value={newCustomPlatform.platformId}
            onChange={(event) =>
              setNewCustomPlatform((current) => ({
                ...current,
                platformId: event.target.value,
              }))
            }
          />
          <button type="button" onClick={addCustomPlatform}>
            <Plus size={16} />
            添加
          </button>
        </section>

        <div className="settings-grid">
          {accountCards.map((config) => {
            const platformId = config.platformId;
            const schema = isBuiltInPlatformId(platformId)
              ? PLATFORM_ACCOUNT_SCHEMAS[platformId]
              : null;
            const displayName = config.displayName || schema?.displayName || platformId;
            const formEnabled =
              (accountForms[platformId]?.enabled ?? String(config.enabled)) === 'true';
            const maskedEntries = Object.entries(config.maskedFields);
            const docs = isBuiltInPlatformId(platformId)
              ? PLATFORM_CONFIG_LINKS[platformId] ?? []
              : [];
            const customFields = customAccountFields[platformId] ?? [];

            return (
              <section className="account-card" key={platformId}>
                <div className="account-heading">
                  <div>
                    <div className="account-title-row">
                      <h2>{displayName}</h2>
                      {!config.builtIn ? <span className="custom-platform-badge">自定义</span> : null}
                    </div>
                    <div className="account-doc-links">
                      {docs.map((link) => (
                        <a key={link.url} href={link.url} rel="noreferrer" target="_blank">
                          {link.label}
                          <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  </div>
                  <label className="account-toggle">
                    <input
                      checked={formEnabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateAccountField(platformId, 'enabled', String(event.target.checked))
                      }
                    />
                    <span aria-hidden="true" />
                    <strong>{formEnabled ? '启用' : '关闭'}</strong>
                  </label>
                </div>

                <p className={`account-state ${config.status}`}>{config.statusMessage}</p>

                {maskedEntries.length > 0 ? (
                  <div className="account-saved-fields">
                    {maskedEntries.map(([key, value]) => (
                      <span key={key}>
                        {getAccountFieldLabel(platformId, key)}: {value}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="account-fields">
                  {(schema?.fields ?? []).map((field) => (
                    <label className="field" key={field.key}>
                      <span>{field.label}</span>
                      <input
                        placeholder={field.required ? '必填' : '选填'}
                        type={field.kind === 'password' ? 'password' : 'text'}
                        value={accountForms[platformId]?.[field.key] ?? ''}
                        onChange={(event) =>
                          updateAccountField(platformId, field.key, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>

                {!config.builtIn ? (
                  <div className="custom-config-section">
                    <div className="custom-config-heading">
                      <span>自定义参数</span>
                      <button type="button" onClick={() => addCustomAccountField(platformId)}>
                        <Plus size={14} />
                        添加参数
                      </button>
                    </div>
                    {customFields.length > 0 ? (
                      <div className="custom-config-list">
                        {customFields.map((field) => (
                          <div className="custom-config-row" key={field.id}>
                            <input
                              placeholder="参数名"
                              value={field.key}
                              onChange={(event) =>
                                updateCustomAccountField(platformId, field.id, {
                                  key: event.target.value,
                                })
                              }
                            />
                            <input
                              placeholder="参数值"
                              value={field.value}
                              onChange={(event) =>
                                updateCustomAccountField(platformId, field.id, {
                                  value: event.target.value,
                                })
                              }
                            />
                            <button
                              type="button"
                              aria-label="删除参数"
                              onClick={() => removeCustomAccountField(platformId, field.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="custom-config-empty">先添加这个平台需要保存的参数</p>
                    )}
                  </div>
                ) : null}

                <div className="account-actions">
                  <button
                    type="button"
                    disabled={isSavingAccount === platformId}
                    onClick={() => void handleSaveAccount(platformId, displayName)}
                  >
                    {isSavingAccount === platformId ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    保存配置
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() =>
                      config.configured
                        ? void handleDeleteAccount(platformId)
                        : removeCustomPlatformDraft(platformId)
                    }
                  >
                    <Trash2 size={16} />
                    删除
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
    <div className={`app-shell view-${currentView}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <AppIcon />
          </div>
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
          onClick={toggleSettingsView}
        >
          <Settings size={16} />
          设置
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <h1>{currentView === 'settings' ? '设置' : '多平台内容适配'}</h1>
          {currentView === 'results' ? (
            <div className="topbar-actions">
              <span className="topbar-chip">平台 {generatedDraftCount}</span>
              <span className="topbar-chip">{getContentReviewStatusText(contentReview?.status)}</span>
            </div>
          ) : null}
        </header>

        {currentView === 'settings'
          ? renderSettingsView()
          : currentView === 'results'
            ? renderResultsView()
            : renderEditorView()}
      </main>

      {notice ? <div className="toast">{notice}</div> : null}
    </div>
  );
}

function getPlatformName(
  platformId: PlatformId,
  adapters: Array<{ id: PlatformId; displayName: string }> = PLATFORM_ADAPTERS,
): string {
  return adapters.find((adapter) => adapter.id === platformId)?.displayName ?? platformId;
}

function createFallbackAccountConfig(platformId: PlatformId): PlatformAccountConfig {
  return {
    platformId,
    displayName: getPlatformName(platformId),
    builtIn: true,
    enabled: false,
    configured: false,
    status: 'not-configured',
    statusMessage: '未配置平台',
    maskedFields: {},
  };
}

function createCustomFallbackAccountConfig(
  platformId: string,
  displayName: string,
): PlatformAccountConfig {
  return {
    platformId,
    displayName,
    builtIn: false,
    enabled: true,
    configured: false,
    status: 'not-configured',
    statusMessage: '未配置平台',
    maskedFields: {},
  };
}

function getAccountDisplayName(platformId: string, fallback?: string): string {
  return (
    fallback ??
    PLATFORM_ADAPTERS.find((adapter) => adapter.id === platformId)?.displayName ??
    platformId
  );
}

function getAccountFieldLabel(platformId: string, key: string): string {
  if (!isBuiltInPlatformId(platformId)) {
    return key;
  }
  return (
    PLATFORM_ACCOUNT_SCHEMAS[platformId].fields.find((field) => field.key === key)?.label ?? key
  );
}

function isBuiltInPlatformId(platformId: string): platformId is BuiltInPlatformId {
  return Object.hasOwn(PLATFORM_ACCOUNT_SCHEMAS, platformId);
}

function normalizeCustomPlatformId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

function getContentReviewStatusText(status?: ContentReviewStatus): string {
  if (status === 'passed') {
    return '已通过';
  }
  if (status === 'needs-attention') {
    return '需关注';
  }
  if (status === 'blocked') {
    return '已拦截';
  }
  return '待审查';
}

function getReviewIssueKindLabel(kind: ContentReviewIssue['kind']): string {
  return kind === 'legal' ? '法律风险' : '价值观风险';
}

function getPlatformListStateText(
  draft: PlatformDraft,
  publishStatus?: SavedSession['publishEvents'][number]['status'],
): string {
  if (publishStatus === 'success') {
    return '模拟发布成功';
  }
  if (publishStatus === 'failed') {
    return '模拟发布失败';
  }
  if (publishStatus === 'pending') {
    return '模拟发布中';
  }
  if (draft.status === 'needs-review') {
    return '需检查';
  }
  return '已生成';
}

function getPublishEventText(event?: SavedSession['publishEvents'][number]): string {
  if (!event) {
    return '未发布';
  }
  if (event.status === 'success') {
    return `成功, ${formatTime(event.createdAt)}`;
  }
  if (event.status === 'failed') {
    return `失败, ${event.message}`;
  }
  return '进行中';
}

function sanitizeDraftPreviewHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ADD_ATTR: ['target', 'rel'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  });
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
