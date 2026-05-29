# PostPilot v0.1.0

PostPilot v0.1.0 是第一个可发布桌面版本, 面向需要将同一份内容同步适配到微信公众号, 知乎, B 站和小红书的创作者。

## 新功能

- 固定使用 `deepseek-v4-flash` 生成多平台内容版本
- 支持未配置 API Key 时使用本地规则生成演示版本
- 支持本地 SQLite 保存历史记录, 内容审查结果和发布记录
- 支持 Markdown, HTML 和纯文本预览
- 支持平台草稿编辑, 保存和人工审核
- 支持发布前 AI 内容审查, 法律风险标红, 价值观风险标黄
- 法律风险未处理时会拦截真实发布和模拟发布
- 支持账号配置, 授权校验和删除配置
- 支持微信公众号官方 API 创建草稿
- 支持发布任务中心, 展示进度, 最新回执和失败重试入口
- 支持复制, 导出和模拟发布

## 发布说明

- 知乎, B 站和小红书当前没有伪装真实发布成功, 无稳定公开写入接口时会保留失败回执或导出流程
- 应用内不提供模型切换, 模型固定为 `deepseek-v4-flash`
- 应用内不提供 `.env` 修改入口

## 第三方依赖

主要依赖包括 Electron, React, Vite, electron-vite, TypeScript, Node 24 `node:sqlite`, Zod, dotenv, lucide-react, marked, DOMPurify, Vitest 和 electron-builder。

## 代码来源

本版本业务代码为本项目内原创实现, 当前没有复用外部项目或过去项目的业务代码片段。
