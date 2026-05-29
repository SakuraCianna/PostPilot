import {
  formatDraftForClipboard,
  getPlatformAdapter,
} from '../../shared/platformAdapters';
import type {
  PlatformId,
  PlatformAdapter,
  PublishArtifact,
  PublishTaskInput,
  PublishTaskResult,
  SecretPlatformAccountConfig,
} from '../../shared/types';
import { publishWithOfficialConnector } from './officialConnectors';

export interface PublishTaskContext {
  getAccountConfig?: (platformId: PlatformId) => SecretPlatformAccountConfig | null;
  fetchImpl?: typeof fetch;
}

export async function createPublishTask(
  input: PublishTaskInput,
  context: PublishTaskContext = {},
): Promise<PublishTaskResult> {
  const adapter = getPlatformAdapter(input.draft.platformId);

  if (!adapter.publishModes.includes(input.mode)) {
    return {
      status: 'failed',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'failed',
        message: `${adapter.displayName} 不支持当前发布方式`,
      },
    };
  }

  if (input.mode !== 'exportOnly' && input.contentReview?.status === 'blocked') {
    return {
      status: 'failed',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'failed',
        message: '内容法律风险未处理, 已拦截发布',
      },
    };
  }

  if (input.mode === 'simulated') {
    return {
      status: 'success',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'success',
        message: `${adapter.displayName} 模拟发布已完成`,
      },
    };
  }

  if (input.mode === 'exportOnly') {
    return {
      status: 'success',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'success',
        message: `${adapter.displayName} 导出内容已生成`,
      },
      artifact: createArtifact(input),
    };
  }

  if (input.mode === 'officialApi') {
    const result = await publishWithOfficialConnector({
      draft: input.draft,
      account: context.getAccountConfig?.(input.draft.platformId) ?? null,
      fetchImpl: context.fetchImpl,
    });
    return {
      status: result.status,
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: result.status,
        message: result.message,
        receipt: result.receipt,
        attempts: result.attempts,
      },
    };
  }

  if (input.mode === 'browserAssist') {
    return {
      status: 'pending',
      event: {
        platformId: input.draft.platformId,
        mode: input.mode,
        status: 'pending',
        message: `${adapter.displayName} 浏览器辅助填充包已生成, 请登录平台后执行自动填充脚本`,
      },
      artifact: createBrowserAssistArtifact(input, adapter),
    };
  }

  return {
    status: 'failed',
    event: {
      platformId: input.draft.platformId,
      mode: input.mode,
      status: 'failed',
      message: `${adapter.displayName} 官方接口发布尚未接入`,
    },
  };
}

function createBrowserAssistArtifact(
  input: PublishTaskInput,
  adapter: PlatformAdapter,
): PublishArtifact {
  const payload = {
    platformName: adapter.displayName,
    targetUrl: getBrowserAssistTargetUrl(input.draft.platformId),
    title: input.draft.title,
    summary: input.draft.summary,
    body: formatDraftForClipboard(input.draft),
    hashtags: input.draft.hashtags,
  };
  const script = createBrowserAssistScript(payload);

  return {
    filename: `${input.draft.platformId}-browser-assist-${Date.now()}.html`,
    content: createBrowserAssistHtml(payload, script),
    mimeType: 'text/html;charset=utf-8',
  };
}

function getBrowserAssistTargetUrl(platformId: PlatformId): string {
  const urls: Record<PlatformId, string> = {
    wechat: 'https://mp.weixin.qq.com/',
    zhihu: 'https://www.zhihu.com/',
    bilibili: 'https://member.bilibili.com/',
    xiaohongshu: 'https://creator.xiaohongshu.com/',
  };
  return urls[platformId];
}

function createBrowserAssistScript(payload: {
  platformName: string;
  targetUrl: string;
  title: string;
  summary: string;
  body: string;
  hashtags: string[];
}): string {
  return `(function () {
  const payload = ${JSON.stringify(payload, null, 2)};
  const fields = [
    { name: '标题', value: payload.title, selectors: ['input[placeholder*=标题]', 'textarea[placeholder*=标题]', 'input[name*=title]', '[contenteditable=true]'] },
    { name: '正文', value: payload.body, selectors: ['textarea[placeholder*=正文]', 'textarea[placeholder*=内容]', '[contenteditable=true]', '.ProseMirror', '.ql-editor'] },
    { name: '摘要', value: payload.summary, selectors: ['textarea[placeholder*=摘要]', 'input[placeholder*=摘要]', 'textarea[name*=summary]'] },
    { name: '标签', value: payload.hashtags.map((tag) => '#' + tag).join(' '), selectors: ['input[placeholder*=标签]', 'input[placeholder*=话题]', 'textarea[placeholder*=标签]'] }
  ];

  function setValue(target, value) {
    if (!target || !value) return false;
    target.focus();
    if ('value' in target) {
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    target.textContent = value;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    return true;
  }

  const results = fields.map((field) => {
    const target = field.selectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    return {
      name: field.name,
      ok: setValue(target, field.value)
    };
  });

  console.table(results);
  alert('PostPilot 自动填充已尝试执行, 请检查标题, 正文, 摘要和标签后再发布');
})();`;
}

function createBrowserAssistHtml(
  payload: {
    platformName: string;
    targetUrl: string;
    title: string;
    summary: string;
    body: string;
    hashtags: string[];
  },
  script: string,
): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PostPilot 浏览器辅助 - ${escapeHtml(payload.platformName)}</title>
  <style>
    body { margin: 0; padding: 32px; color: #111; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; }
    main { max-width: 920px; margin: 0 auto; }
    section { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-top: 14px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { margin: 0 0 10px; font-size: 16px; }
    a, button { color: #111; font-weight: 700; }
    pre { overflow: auto; border-radius: 8px; background: #f5f5f5; padding: 14px; white-space: pre-wrap; }
    .field { display: grid; gap: 6px; margin-top: 10px; }
    .field strong { font-size: 13px; }
    .field div { border: 1px solid #e4e4e4; border-radius: 8px; padding: 10px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(payload.platformName)} 浏览器辅助发布</h1>
    <p>先打开目标平台并登录, 再把下方自动填充脚本粘贴到浏览器控制台执行。执行后仍需要检查页面内容和平台提示。</p>
    <section>
      <h2>目标入口</h2>
      <a href="${escapeAttribute(payload.targetUrl)}" target="_blank" rel="noreferrer">${escapeHtml(payload.targetUrl)}</a>
    </section>
    <section>
      <h2>待填充内容</h2>
      <div class="field"><strong>标题</strong><div>${escapeHtml(payload.title)}</div></div>
      <div class="field"><strong>摘要</strong><div>${escapeHtml(payload.summary)}</div></div>
      <div class="field"><strong>正文</strong><div>${escapeHtml(payload.body)}</div></div>
      <div class="field"><strong>标签</strong><div>${escapeHtml(payload.hashtags.map((tag) => `#${tag}`).join(' '))}</div></div>
    </section>
    <section>
      <h2>自动填充脚本</h2>
      <pre>${escapeHtml(script)}</pre>
    </section>
  </main>
</body>
</html>`;
}

function createArtifact(input: PublishTaskInput): PublishArtifact {
  const adapter = getPlatformAdapter(input.draft.platformId);
  const exportMeta = getExportMeta(adapter.exportFormat);

  return {
    filename: `${input.draft.platformId}-${Date.now()}.${exportMeta.extension}`,
    content: formatDraftForClipboard(input.draft),
    mimeType: exportMeta.mimeType,
  };
}

function getExportMeta(format: 'html' | 'markdown' | 'plain'): {
  extension: string;
  mimeType: string;
} {
  if (format === 'html') {
    return {
      extension: 'html',
      mimeType: 'text/html;charset=utf-8',
    };
  }

  if (format === 'markdown') {
    return {
      extension: 'md',
      mimeType: 'text/markdown;charset=utf-8',
    };
  }

  return {
    extension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  };
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
