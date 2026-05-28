# PostPilot

PostPilot is a local Electron tool for creators who need to adapt one source draft into platform-specific versions for WeChat Official Account, Zhihu, Bilibili, and Xiaohongshu.

## Stack

- Electron, React, Vite, TypeScript
- Local SQLite through Node 24 `node:sqlite`
- DeepSeek model fixed to `deepseek-v4-flash`
- Simulated publishing in the first version, with adapter hooks for official API and browser-assisted publishing

## Development

```powershell
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` and set `DEEPSEEK_API_KEY` when you want AI-generated adaptations. Without a key, PostPilot uses local rule-based drafts so the app can still be tested.
