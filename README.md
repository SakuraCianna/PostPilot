# PostPilot

PostPilot 是一个本地桌面端创作者发布助手。用户输入一份原始内容后, 工具会生成微信公众号, 知乎, B 站, 小红书四个平台的适配版本, 并保留本地历史记录。

## 当前功能

- 输入标题和正文, 生成四个平台版本
- 固定使用 `deepseek-v4-flash` 模型
- 未配置 DeepSeek API Key 时, 自动使用本地规则生成可演示版本
- 可在应用内保存 DeepSeek API Key 和 API 地址
- 使用本地 SQLite 保存历史记录和模拟发布记录
- 支持复制, 导出和一键模拟发布
- 通过平台适配器预留官方 API 发布和浏览器辅助发布扩展点

## 第三方依赖和框架

- Electron, 桌面端外壳和主进程能力
- React, 渲染层界面
- Vite 和 electron-vite, 本地开发和构建
- TypeScript, 类型约束
- Node 24 `node:sqlite`, 本地 SQLite 数据库
- Zod, DeepSeek 返回结构校验
- dotenv, 本地环境变量读取
- lucide-react, 按钮和状态图标
- Vitest, 单元测试

## 原创功能部分

- 平台适配器结构和四个平台的本地适配规则
- DeepSeek 调用封装和本地规则回退逻辑
- SQLite 历史记录和模拟发布记录仓库
- 本地模型设置仓库和 API Key 加密保存流程
- Electron IPC 安全桥接
- 黑白简约三栏创作者工作台界面

当前没有复用外部项目或过去项目的业务代码片段。如果后续复用历史代码, 必须在 PR 描述中注明来源和修改范围。

## 开发

```powershell
npm install
npm run dev
```

## 检查

```powershell
npm test
npm run typecheck
npm run build
```

## 环境变量

可以在应用内的“模型设置”保存 `DEEPSEEK_API_KEY` 和 DeepSeek API 地址。开发时也可以复制 `.env.example` 为 `.env.local`, 然后填写 `DEEPSEEK_API_KEY`。应用内设置会优先于环境变量。不填写时仍可使用本地规则生成平台版本。
