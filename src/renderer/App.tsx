import {
  ArrowLeft,
  Check,
  Clipboard,
  FileText,
  History,
  Loader2,
  Monitor,
  Play,
  Plus,
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
import { createDraftPreviewHtml } from './previewMarkup';
import {
  type ContentReviewIssue,
  type ContentReviewStatus,
  type PlatformAccountConfig,
  type PlatformDraft,
  type PlatformId,
  type SavedSession,
  type SessionSummary,
} from '../shared/types';

const DEMO_TITLE = '一篇内容如何高效分发到三个平台';

const DEMO_BODY = `很多创作者真正头疼的不是写不出内容, 而是一篇内容写完之后, 还要分别改成公众号长文、哔哩哔哩视频简介和抖音短视频文案。

同一段观点放在不同平台里, 需要完全不同的表达方式。公众号读者更在意结构、论证和完整阅读体验; 哔哩哔哩用户希望快速看到视频看点、适合谁看、评论区可以聊什么; 抖音则要求信息更前置, 几秒内就让用户知道为什么要继续看。

我的做法是先保留一份完整的原始内容, 再让工具基于平台预设自动生成不同版本。每个平台的预设会记录标题偏好、正文节奏、互动方式和标签建议, 这样改写时就不是简单截断, 而是围绕平台语境重新组织内容。

这个流程适合日常选题复用、课程笔记拆条、产品更新说明和经验文章分发。创作者只需要维护原文和平台预设, 就能更快得到可复制、可检查、可模拟发布的版本。`;

const NOTICE_TTL_MS = 3000;

type AppView = 'editor' | 'results' | 'settings';
type PublishProgress = PlatformId | 'all' | null;

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<SavedSession | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('wechat');
  const [title, setTitle] = useState(DEMO_TITLE);
  const [body, setBody] = useState(DEMO_BODY);
  const [currentView, setCurrentView] = useState<AppView>('editor');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReviewingContent, setIsReviewingContent] = useState(false);
  const [isRewritingContent, setIsRewritingContent] = useState(false);
  const [publishingPlatform, setPublishingPlatform] = useState<PublishProgress>(null);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [deletingPreset, setDeletingPreset] = useState<string | null>(null);
  const [accountConfigs, setAccountConfigs] = useState<PlatformAccountConfig[]>([]);
  const [newCustomPlatform, setNewCustomPlatform] = useState({
    displayName: '',
  });
  const [notice, setNotice] = useState('');

  const customPresetConfigs = useMemo(
    () => accountConfigs.filter((config) => !config.builtIn),
    [accountConfigs],
  );
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
  const activePresetCount =
    PLATFORM_ADAPTERS.length +
    customPresetConfigs.filter((config) => config.enabled && config.configured).length;

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
    setTitle(DEMO_TITLE);
    setBody(DEMO_BODY);
    setSelectedPlatform('wechat');
    setCurrentView('editor');
    setNotice('已载入演示文章');
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

  async function handleCreateCustomPreset() {
    const displayName = newCustomPlatform.displayName.trim();
    const platformId = createCustomPlatformId(displayName);

    if (!displayName) {
      setNotice('请填写平台名称');
      return;
    }
    if (
      PLATFORM_ADAPTERS.some((adapter) => adapter.id === platformId) ||
      accountConfigs.some(
        (config) => config.platformId === platformId || config.displayName === displayName,
      )
    ) {
      setNotice('平台预设已存在');
      return;
    }

    setIsCreatingPreset(true);
    try {
      const saved = await window.postPilot.saveAccountConfig({
        platformId,
        displayName,
        enabled: true,
        fields: {},
      });
      const preset = await window.postPilot.researchPlatformPreset({
        platformId,
        displayName: saved.displayName,
      });
      await refreshAccountConfigs();
      setNewCustomPlatform({ displayName: '' });
      setNotice(`${saved.displayName} 预设已创建, ${preset.message}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创建平台预设失败');
    } finally {
      setIsCreatingPreset(false);
    }
  }

  async function handleToggleCustomPreset(config: PlatformAccountConfig) {
    try {
      const saved = await window.postPilot.saveAccountConfig({
        platformId: config.platformId,
        displayName: config.displayName,
        enabled: !config.enabled,
        fields: {},
      });
      setAccountConfigs((current) =>
        current.map((item) => (item.platformId === saved.platformId ? saved : item)),
      );
      setNotice(`${saved.displayName} 预设已${saved.enabled ? '启用' : '停用'}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '更新平台预设失败');
    }
  }

  async function handleDeleteCustomPreset(platformId: string) {
    const target = accountConfigs.find((config) => config.platformId === platformId);
    setDeletingPreset(platformId);
    try {
      const configs = await window.postPilot.deleteAccountConfig(platformId);
      setAccountConfigs(configs);
      setNotice(`${target?.displayName ?? getPlatformName(platformId)} 预设已删除`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除平台预设失败');
    } finally {
      setDeletingPreset(null);
    }
  }

  function toggleSettingsView() {
    if (currentView === 'settings') {
      setCurrentView(currentSession ? 'results' : 'editor');
      return;
    }
    void refreshAccountConfigs();
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
                  完成 {publishStats.success} / 失败 {publishStats.failed} / 等待{' '}
                  {publishStats.waiting}
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
    return (
      <section className="settings-page">
        <div className="settings-summary">
          <div>
            <span>内置预设</span>
            <strong>{PLATFORM_ADAPTERS.length}</strong>
          </div>
          <div>
            <span>自定义预设</span>
            <strong>{customPresetConfigs.length}</strong>
          </div>
          <div>
            <span>当前启用</span>
            <strong>{activePresetCount}</strong>
          </div>
        </div>

        <section className="preset-location-card">
          <FileText size={18} />
          <div>
            <strong>预设文件</strong>
            <span>
              仓库演示文件在 <code>platform-presets/*.md</code>, 启动后会同步到本地用户数据目录。
            </span>
          </div>
        </section>

        <section className="custom-platform-panel">
          <div>
            <strong>新增平台预设</strong>
            <span>输入平台名称后, 直接生成 Markdown 风格预设</span>
          </div>
          <input
            placeholder="平台名称"
            value={newCustomPlatform.displayName}
            onChange={(event) =>
              setNewCustomPlatform((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
          <button type="button" disabled={isCreatingPreset} onClick={handleCreateCustomPreset}>
            {isCreatingPreset ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
            生成预设
          </button>
        </section>

        <section className="preset-section">
          <div className="preset-section-heading">
            <h2>内置平台预设</h2>
            <span>随应用默认提供</span>
          </div>
          <div className="preset-grid">
            {PLATFORM_ADAPTERS.map((adapter) => (
              <article className="preset-card" key={adapter.id}>
                <div className="preset-heading">
                  <div>
                    <div className="preset-title-row">
                      <h3>{adapter.displayName}</h3>
                      <span className="preset-badge">内置</span>
                    </div>
                  </div>
                  <span className="preset-state enabled">已启用</span>
                </div>
                <p className="preset-tone">{adapter.tone}</p>
                <div className="preset-meta">
                  <span>文件: platform-presets/{adapter.id}.md</span>
                  <span>格式: {getExportFormatLabel(adapter.exportFormat)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="preset-section">
          <div className="preset-section-heading">
            <h2>自定义平台预设</h2>
            <span>新增后会参与下一次平台版本生成</span>
          </div>
          {customPresetConfigs.length > 0 ? (
            <div className="preset-grid">
              {customPresetConfigs.map((config) => (
                <article className="preset-card" key={config.platformId}>
                  <div className="preset-heading">
                    <div>
                      <div className="preset-title-row">
                        <h3>{config.displayName}</h3>
                        <span className="preset-badge">自定义</span>
                      </div>
                    </div>
                    <span className={`preset-state ${config.enabled ? 'enabled' : 'disabled'}`}>
                      {config.enabled ? '已启用' : '已停用'}
                    </span>
                  </div>
                  <div className="preset-meta">
                    <span>文件: platform-presets/{config.platformId}.md</span>
                    <span>{config.configured ? '预设已生成' : '待生成'}</span>
                  </div>
                  <div className="preset-actions">
                    <button type="button" onClick={() => void handleToggleCustomPreset(config)}>
                      {config.enabled ? '停用' : '启用'}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={deletingPreset === config.platformId}
                      onClick={() => void handleDeleteCustomPreset(config.platformId)}
                    >
                      {deletingPreset === config.platformId ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <Trash2 size={15} />
                      )}
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="preset-empty">还没有自定义平台预设, 输入平台名称即可生成。</div>
          )}
        </section>
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
          <h1>{currentView === 'settings' ? '平台预设' : '多平台内容适配'}</h1>
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

function createCustomPlatformId(displayName: string): string {
  const normalized = displayName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');

  if (normalized) {
    return normalized;
  }

  const encoded = Array.from(displayName.trim())
    .map((char) => char.codePointAt(0)?.toString(36))
    .filter(Boolean)
    .join('-');

  return encoded ? `platform-${encoded}` : '';
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

function getExportFormatLabel(format: 'html' | 'markdown' | 'plain'): string {
  const labels = {
    html: 'HTML',
    markdown: 'Markdown',
    plain: '纯文本',
  };
  return labels[format];
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
