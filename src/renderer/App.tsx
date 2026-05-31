import {
  Activity,
  Check,
  Clipboard,
  Eye,
  ExternalLink,
  History,
  Loader2,
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
import { AppIcon } from './components/AppIcon';
import {
  createCustomPlatformAdapters,
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
  type BuiltInPlatformId,
  type PlatformAccountConfig,
  type PlatformDraft,
  type PlatformId,
  type PublishMode,
  type SavedSession,
  type SessionSummary,
} from '../shared/types';

const INITIAL_BODY = `把你的原始内容粘贴到这里。

PostPilot 会生成公众号, 知乎, B 站, 小红书, 抖音等多个平台版本。

第一版默认保存历史, 并支持复制, 导出和模拟发布。`;

const SIDEBAR_WIDTH = 280;
const MIN_WORKSPACE_WIDTH = 460;
const PREVIEW_MIN_WIDTH = 340;
const PREVIEW_MAX_WIDTH = 760;
const RESIZER_WIDTH = 8;
const NOTICE_TTL_MS = 5000;

const PLATFORM_CONFIG_LINKS: Record<
  BuiltInPlatformId,
  Array<{ label: string; url: string }>
> = {
  wechat: [
    {
      label: '基本配置',
      url: 'https://mp.weixin.qq.com/',
    },
    {
      label: '创作后台',
      url: 'https://mp.weixin.qq.com/',
    },
  ],
  zhihu: [
    {
      label: '开放平台',
      url: 'https://developer.zhihu.com/',
    },
  ],
  bilibili: [
    {
      label: '开放平台',
      url: 'https://openhome.bilibili.com/doc',
    },
  ],
  xiaohongshu: [
    {
      label: '开放平台',
      url: 'https://school.xiaohongshu.com/en/open/quick-start/summary.html',
    },
    {
      label: '服务商接口',
      url: 'https://miniapp.xiaohongshu.com/third/api-3rd/post-api-rmp-tp-token',
    },
  ],
  douyin: [
    {
      label: '创作服务',
      url: 'https://creator.douyin.com/',
    },
  ],
  kuaishou: [
    {
      label: '创作者服务',
      url: 'https://cp.kuaishou.com/',
    },
  ],
  weibo: [
    {
      label: '微博首页',
      url: 'https://weibo.com/',
    },
  ],
  toutiao: [
    {
      label: '头条号',
      url: 'https://mp.toutiao.com/',
    },
  ],
  baijiahao: [
    {
      label: '百家号',
      url: 'https://baijiahao.baidu.com/',
    },
  ],
};

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
  const [currentView, setCurrentView] = useState<'editor' | 'settings'>('editor');
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
  const [previewWidth, setPreviewWidth] = useState(() => getDefaultPreviewWidth());

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
    function handleResize() {
      setPreviewWidth((current) => clampPreviewWidth(current));
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(''), NOTICE_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const previewDrafts = useMemo(() => {
    const customAdapters = createCustomPlatformAdapters(accountConfigs);
    return currentSession?.drafts ?? createLocalDrafts({ title, body }, customAdapters);
  }, [accountConfigs, body, currentSession, title]);

  const selectedDraft = useMemo(() => {
    return (
      previewDrafts.find((draft) => draft.platformId === selectedPlatform) ??
      previewDrafts[0]
    );
  }, [previewDrafts, selectedPlatform]);

  const selectedAdapter = useMemo(
    () =>
      activePlatformAdapters.find(
        (adapter) => adapter.id === (selectedDraft?.platformId ?? selectedPlatform),
      ),
    [activePlatformAdapters, selectedDraft?.platformId, selectedPlatform],
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

  const editableDraft = selectedDraft;

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
      contentReview,
      publishEvents: selectedPublishEvents,
    });
  }, [contentReview, editableDraft, selectedPublishEvents]);

  const generatedDraftCount = useMemo(
    () =>
      previewDrafts.filter(
        (draft) =>
          draft.status === 'ready' &&
          activePlatformAdapters.some((adapter) => adapter.id === draft.platformId),
      ).length,
    [activePlatformAdapters, previewDrafts],
  );

  const allPlatformDraftsGenerated = activePlatformAdapters.every((adapter) =>
    previewDrafts.some((draft) => draft.platformId === adapter.id),
  );

  const publishTimeline = useMemo(
    () =>
      createPublishTimeline({
        session: currentSession,
        adapters: activePlatformAdapters,
      }),
    [activePlatformAdapters, currentSession],
  );

  const publishReadiness = useMemo(
    () =>
      createPublishReadiness({
        session: currentSession,
        adapters: activePlatformAdapters,
        accounts: accountConfigs,
      }),
    [accountConfigs, activePlatformAdapters, currentSession],
  );

  const legalIssueCount =
    contentReview?.issues.filter((issue) => issue.kind === 'legal').length ?? 0;
  const valuesIssueCount =
    contentReview?.issues.filter((issue) => issue.kind === 'values').length ?? 0;
  const contentReviewHasIssues = (contentReview?.issues.length ?? 0) > 0;
  const contentReviewAllowsPublish = Boolean(contentReview) && contentReview?.status !== 'blocked';
  const canRunPublishAll =
    allPlatformDraftsGenerated && contentReviewAllowsPublish && publishReadiness.canRunPublishAll;
  const shellStyle = {
    '--preview-width': `${previewWidth}px`,
  } as CSSProperties;

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
      const reviewed = await window.postPilot.runContentReview({
        sessionId: currentSession.id,
      });
      setCurrentSession(reviewed);
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
      if (!currentSession.contentReview?.issues.length) {
        throw new Error('请先完成内容审查');
      }

      const rewritten = await window.postPilot.rewriteContentRisks({
        sessionId: currentSession.id,
      });
      setCurrentSession(rewritten);
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
    setNotice(loaded.modelMessage);
  }

  function handleNewSession() {
    setCurrentSession(null);
    setTitle('');
    setBody('');
    setSelectedPlatform('wechat');
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
    const adapter = activePlatformAdapters.find((item) => item.id === draft.platformId);
    await navigator.clipboard.writeText(formatDraftForClipboard(draft, adapter));
    setNotice(`已复制 ${getPlatformName(draft.platformId, activePlatformAdapters)} 版本`);
  }

  async function handleRunPublishTask(platformId: PlatformId, mode: PublishMode) {
    if (!currentSession) {
      setNotice('请先生成并保存一次平台版本');
      return;
    }

    setIsPublishing(true);
    try {
      const result = await window.postPilot.runPublishTask({
        sessionId: currentSession.id,
        platformId,
        mode,
      });
      if (result.session) {
        setCurrentSession(result.session);
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
      let updated: SavedSession | null = currentSession;
      const publishableDrafts = currentSession.drafts.filter((draft) =>
        publishReadiness.publishablePlatformIds.includes(draft.platformId),
      );
      if (publishableDrafts.length === 0) {
        throw new Error('当前没有可模拟发布的平台');
      }

      for (const draft of publishableDrafts) {
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
      setNotice(`已完成 ${publishableDrafts.length} 个平台的模拟发布`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模拟发布失败');
    } finally {
      setIsPublishing(false);
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
      setAccountForms((current) => ({
        ...current,
        [platformId]: {},
      }));
      setCustomAccountFields((current) => ({
        ...current,
        [platformId]: [],
      }));
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
      setAccountForms((current) => ({
        ...current,
        [platformId]: {},
      }));
      setCustomAccountFields((current) => ({
        ...current,
        [platformId]: [],
      }));
      setCustomPlatformDrafts((current) =>
        current.filter((draft) => draft.platformId !== platformId),
      );
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
    setCustomAccountFields((current) => ({
      ...current,
      [platformId]: [],
    }));
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

  function renderSettingsView() {
    const configuredCount = accountConfigs.filter((config) => config.configured).length;
    const configuredBuiltInCount = accountConfigs.filter(
      (config) => config.builtIn && config.configured,
    ).length;
    const missingCount = PLATFORM_ADAPTERS.length - configuredBuiltInCount;
    const customConfigs = accountConfigs.filter((config) => !config.builtIn);

    return (
      <section className="settings-page">
        <div className="settings-summary">
          <div>
            <span>已预设</span>
            <strong>{configuredCount}</strong>
          </div>
          <div>
            <span>自定义</span>
            <strong>{customConfigs.length}</strong>
          </div>
          <div>
            <span>未配置</span>
            <strong>{missingCount}</strong>
          </div>
        </div>

        <section className="custom-platform-panel">
          <div>
            <strong>新增平台配置</strong>
            <span>保存后会用 Tavily 查询平台风格, 并在后台生成 Markdown 预设</span>
          </div>
          <input
            value={newCustomPlatform.displayName}
            placeholder="平台名称, 如抖音"
            onChange={(event) =>
              setNewCustomPlatform((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
          <input
            value={newCustomPlatform.platformId}
            placeholder="平台标识, 如 douyin"
            onChange={(event) =>
              setNewCustomPlatform((current) => ({
                ...current,
                platformId: event.target.value,
              }))
            }
          />
          <button type="button" onClick={addCustomPlatform}>
            <Plus size={15} />
            添加平台
          </button>
        </section>

        <div className="settings-grid">
          {PLATFORM_ADAPTERS.map((adapter) => {
            const platformId = adapter.id as BuiltInPlatformId;
            const schema = PLATFORM_ACCOUNT_SCHEMAS[platformId];
            const config =
              accountConfigs.find((item) => item.platformId === adapter.id) ??
              createFallbackAccountConfig(adapter.id);
            const form = accountForms[adapter.id] ?? {};
            const customFields = customAccountFields[adapter.id] ?? [];

            return (
              <section className="account-card" key={adapter.id}>
                <div className="account-heading">
                  <div>
                    <div className="account-title-row">
                      <h2>{adapter.displayName}</h2>
                      <div className="account-doc-links">
                        {PLATFORM_CONFIG_LINKS[platformId].map((link) => (
                          <a
                            href={link.url}
                            key={link.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={13} />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                    <span className={`account-state ${config.status}`}>模拟发布模式</span>
                  </div>
                  <label className="account-toggle">
                    <input
                      checked={form.enabled ? form.enabled === 'true' : config.enabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateAccountField(adapter.id, 'enabled', String(event.target.checked))
                      }
                    />
                    <span aria-hidden="true" />
                    <strong>启用</strong>
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

                <div className="custom-config-section">
                  <div className="custom-config-heading">
                    <span>自定义配置</span>
                    <button type="button" onClick={() => addCustomAccountField(adapter.id)}>
                      <Plus size={14} />
                      添加配置
                    </button>
                  </div>
                  {customFields.length > 0 ? (
                    <div className="custom-config-list">
                      {customFields.map((field) => (
                        <div className="custom-config-row" key={field.id}>
                          <input
                            value={field.key}
                            placeholder="配置名, 如 workspaceId"
                            onChange={(event) =>
                              updateCustomAccountField(adapter.id, field.id, {
                                key: event.target.value,
                              })
                            }
                          />
                          <input
                            value={field.value}
                            placeholder="配置值"
                            onChange={(event) =>
                              updateCustomAccountField(adapter.id, field.id, {
                                value: event.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            aria-label="删除自定义配置"
                            onClick={() => removeCustomAccountField(adapter.id, field.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="custom-config-empty">可添加平台要求的额外参数</p>
                  )}
                </div>

                <div className="account-actions">
                  <button
                    type="button"
                    disabled={isSavingAccount === adapter.id}
                    onClick={() => void handleSaveAccount(adapter.id, adapter.displayName)}
                  >
                    {isSavingAccount === adapter.id ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    保存预设
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
          {[
            ...customConfigs,
            ...customPlatformDrafts.map((draft) =>
              createCustomFallbackAccountConfig(draft.platformId, draft.displayName),
            ),
          ].map((config) => {
            const platformId = config.platformId;
            const displayName = config.displayName;
            const form = accountForms[platformId] ?? {};
            const customFields = customAccountFields[platformId] ?? [];

            return (
              <section className="account-card custom-platform-card" key={platformId}>
                <div className="account-heading">
                  <div>
                    <div className="account-title-row">
                      <h2>{displayName}</h2>
                      <span className="custom-platform-badge">自定义平台</span>
                    </div>
                    <span className={`account-state ${config.status}`}>{config.statusMessage}</span>
                  </div>
                  <label className="account-toggle">
                    <input
                      checked={form.enabled ? form.enabled === 'true' : config.enabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateAccountField(platformId, 'enabled', String(event.target.checked))
                      }
                    />
                    <span aria-hidden="true" />
                    <strong>启用</strong>
                  </label>
                </div>

                <div className="custom-platform-meta">
                  <span>平台标识</span>
                  <code>{platformId}</code>
                </div>

                {Object.keys(config.maskedFields).length > 0 ? (
                  <div className="account-saved-fields">
                    {Object.entries(config.maskedFields).map(([key, value]) => (
                      <span key={key}>
                        {key}: {value}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="custom-config-section">
                  <div className="custom-config-heading">
                    <span>配置参数</span>
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
                            value={field.key}
                            placeholder="参数名, 如 accessToken"
                            onChange={(event) =>
                              updateCustomAccountField(platformId, field.id, {
                                key: event.target.value,
                              })
                            }
                          />
                          <input
                            value={field.value}
                            placeholder="参数值"
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
                    保存并生成预设
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
                    删除平台
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
            <p>
              {currentView === 'settings'
                ? '集中管理平台预设、字段配置与模拟发布开关'
                : '在左侧输入原始内容后，生成各平台版本并直接进入发布与复核流程'}
            </p>
          </div>
          {currentView === 'editor' ? (
            <div className="topbar-actions">
              <span className="topbar-chip">
                {currentSession ? '已保存会话' : '未保存会话'}
              </span>
              <span className="topbar-chip">
                已生成 {generatedDraftCount}/{activePlatformAdapters.length} 平台
              </span>
            </div>
          ) : null}
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
            }}
          />
          <div className="editor-meta">
            <span>平台版本 {generatedDraftCount}/{activePlatformAdapters.length}</span>
            <span>{currentSession ? '已保存' : '本地草稿'}</span>
          </div>
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
          {activePlatformAdapters.map((adapter) => (
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
                <span>{getPlatformName(editableDraft.platformId, activePlatformAdapters)}</span>
                <h2 className="draft-title-text">{editableDraft.title}</h2>
              </div>
              <div className={`status ${contentReview?.status ?? 'not-reviewed'}`}>
                {contentReview?.status === 'passed' ? <Check size={14} /> : <X size={14} />}
                {getContentReviewStatusText(contentReview?.status)}
              </div>
            </div>

            <div className="draft-summary-readonly">
              <span>平台摘要</span>
              <p>{editableDraft.summary || '暂无摘要'}</p>
            </div>

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
                <p className="review-hint">优化后需要重新进行 AI 审查</p>
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

            <div className="draft-preview-heading">
              <Eye size={15} />
              <span>平台正文预览</span>
            </div>
              <article
                className="draft-rendered-preview"
                dangerouslySetInnerHTML={{ __html: draftPreviewHtml }}
              />

            <div className="tags">
              {editableDraft.hashtags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>

            <div className="preview-actions">
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
                    disabled={isPublishing || !contentReviewAllowsPublish}
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
              一键模拟发布全部平台
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
  return fallback ?? PLATFORM_ADAPTERS.find((adapter) => adapter.id === platformId)?.displayName ?? platformId;
}

function getAccountFieldLabel(platformId: string, key: string): string {
  if (!Object.hasOwn(PLATFORM_ACCOUNT_SCHEMAS, platformId)) {
    return key;
  }
  return (
    PLATFORM_ACCOUNT_SCHEMAS[platformId as BuiltInPlatformId].fields.find(
      (field) => field.key === key,
    )
      ?.label ?? key
  );
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

function getPublishModeLabel(mode: PublishMode): string {
  const labels: Record<PublishMode, string> = {
    simulated: '模拟发布',
  };
  return labels[mode];
}

function getPublishModeIcon(mode: PublishMode) {
  return <Play size={16} />;
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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
