# PostPilot

PostPilot 是一个面向创作者的多平台内容适配与发布工具。用户在一个界面内完成内容输入、平台版本生成、AI 审查、发布任务管理和账号配置，支持 Windows 下本地化工作流。

## 已支持能力

- 输入原始标题与正文，一键生成 公众号、知乎、B 站、小红书四个平台的内容版本
- 持久化保存草稿与历史记录（SQLite）
- 每个平台独立预览与编辑适配结果
- AI 内容审查（法律风险 + 价值观风险）与待处理风险重写建议
- 多种发布路径：
  - 模拟发布
  - 导出内容（txt/markdown/html）
  - 官方 API 发布（支持授权校验与失败重试）
  - 浏览器辅助发布（自动填充脚本）
- 平台账号配置支持：
  - 默认内置 4 个平台
  - 自定义新平台配置（手动添加/删除）
  - 启用开关、配置状态查看、授权结果展示
- 发布任务中心：进度、任务明细、重试、平台级失败原因
- 支持设置页集中维护模型配置与平台账号，主界面保留“多平台内容适配”标题

## 技术栈

- Electron + React + TypeScript
- electron-vite + Vite
- Node 24 + 原生 `node:sqlite`
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

## 开发说明

- 所有用户可见提示/报错文本使用中文
- 项目 README 与界面文案保持中文
- 使用中文提交说明并按模块提交
- 每次修改尽量保持 `README` 与代码实现一致
