# PostPilot

PostPilot 是一个面向创作者的多平台内容适配与发布工具。用户在一个界面内完成内容输入、平台版本生成、AI 审查、模拟发布状态查看和平台预设管理，支持 Windows 下本地化工作流。

## 已支持能力

- 输入原始标题与正文，一键生成 微信公众号、哔哩哔哩、抖音 三个内置演示平台的内容版本
- 生成后进入独立结果页, 左侧切换平台, 右侧查看生成版本、手机端展示和 PC 端预览
- 持久化保存草稿与历史记录（SQLite）
- 每个平台独立查看适配结果, 支持复制和模拟发布
- AI 内容审查（法律风险 + 价值观风险）与待处理风险重写建议
- 发布路径统一为模拟发布, 不接入真实发布 API
- 仓库根目录内置 `platform-presets/wechat.md`、`platform-presets/bilibili.md`、`platform-presets/douyin.md` 三份平台风格预设
- 应用启动时会把内置预设同步到 Electron 本地用户数据目录下的 `platform-presets` 文件夹
- 平台预设管理支持：
  - 默认内置 3 个演示平台
  - 自定义新平台预设（手动添加/删除）
  - 已启用的自定义平台会生成通用草稿, 并进入复制和模拟发布流程
  - 启用开关、配置状态查看、平台风格预设生成状态
  - 新增自定义平台后会调用 Tavily 查询公开资料, 并在本地生成 `platform-presets/<platformId>.md`
- 模拟发布状态会记录到历史会话, 可按平台查看最新结果
- 支持设置页集中维护平台预设，主界面保留“多平台内容适配”标题

## 技术栈

- Electron + React + TypeScript
- electron-vite + Vite
- Node 24 + 原生 `node:sqlite`
- Tavily Search API（直接通过 `fetch` 调用, 不引入 SDK）
- DOMPurify + marked
- lucide-react
- Zod + Dotenv
- Vitest + TypeScript 类型检查

## 运行与验证

```powershell
npm install
npm run dev
```

```powershell
npm test
npm run typecheck
npm run build
```

## 打包

- 打包配置在 `package.json` 的 `build.win.target` 中。
- 当前默认输出目标为 Windows MSI。

## 环境变量

示例文件：`.env.example`（需按中文注释风格补充可选配置）

- `DEEPSEEK_API_KEY`: DeepSeek API 密钥
- `DEEPSEEK_BASE_URL`: DeepSeek API 地址
- `TAVILY_API_KEY`: Tavily API 密钥, 用于生成平台风格预设

## 开发说明

- 所有用户可见提示/报错文本使用中文
- 项目 README 与界面文案保持中文
- 使用中文提交说明并按模块提交
- 每次修改尽量保持 `README` 与代码实现一致
