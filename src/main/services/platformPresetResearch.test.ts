import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPlatformPresetResearchService } from './platformPresetResearch';

describe('platform preset research service', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a local fallback markdown preset when Tavily key is missing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-presets-'));
    tempDirs.push(dir);
    const service = createPlatformPresetResearchService({ presetDir: dir });

    const result = await service.researchPlatformPreset({
      platformId: 'bilibili',
      displayName: '哔哩哔哩',
      apiKey: '',
    });

    expect(result.status).toBe('local-fallback');
    expect(result.presetPath).toMatch(/bilibili\.md$/);
    expect(readFileSync(result.presetPath, 'utf8')).toContain('# 哔哩哔哩 平台风格预设');
  });

  it('seeds built-in demo platform presets as markdown files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-presets-'));
    tempDirs.push(dir);
    const service = createPlatformPresetResearchService({ presetDir: dir });

    service.seedDefaultPresets();

    expect(readFileSync(path.join(dir, 'wechat.md'), 'utf8')).toContain(
      '# 微信公众号平台风格预设',
    );
    expect(readFileSync(path.join(dir, 'bilibili.md'), 'utf8')).toContain(
      '# 哔哩哔哩平台风格预设',
    );
    expect(readFileSync(path.join(dir, 'douyin.md'), 'utf8')).toContain(
      '# 抖音平台风格预设',
    );
    expect(Object.keys(service.readPresetMarkdowns()).sort()).toEqual([
      'bilibili',
      'douyin',
      'wechat',
    ]);
  });

  it('calls Tavily search and stores sources in markdown', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'postpilot-presets-'));
    tempDirs.push(dir);
    const service = createPlatformPresetResearchService({ presetDir: dir });
    const calls: unknown[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push({
        headers: init?.headers,
        body: JSON.parse(String(init?.body)),
      });
      return new Response(
        JSON.stringify({
          answer: 'B 站内容适合看点前置, 保留互动感。',
          results: [
            {
              title: 'B 站创作中心',
              url: 'https://member.bilibili.com/',
              content: '创作者可以围绕视频看点组织简介和标签。',
            },
          ],
        }),
      );
    };

    const result = await service.researchPlatformPreset({
      platformId: 'bilibili',
      displayName: '哔哩哔哩',
      apiKey: 'tvly-test',
      fetchImpl,
    });

    expect(result.status).toBe('researched');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { body: { query: string } }).body.query).toContain('哔哩哔哩');
    expect(readFileSync(result.presetPath, 'utf8')).toContain('B 站内容适合看点前置');
    expect(service.readPresetMarkdowns().bilibili).toContain('B 站创作中心');
  });
});
