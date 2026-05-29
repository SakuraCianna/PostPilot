# PostPilot 发布流程

## GitHub 上的 release 是什么

`release` 分支只是一个普通 Git 分支, 用来冻结和验证准备发布的代码。GitHub 页面上的特殊 “Releases” 区域不是由分支自动生成的, 而是由 Git tag 和 GitHub Release 生成。

推荐约定:

- `release` 分支: 发布候选代码
- `v0.1.0` 这类 tag: 某一次确定版本
- GitHub Release: 面向用户展示的发布页, 包含标题, 发布说明和安装包附件

## 本项目发布命令

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run dist
```

`npm run dist` 会生成 Windows x64 MSI 安装包, 输出目录为 `dist-release`。当前 MSI 为未签名内测包, 后续接入代码签名证书后可减少 Windows 安全提示。

## 创建 GitHub Release

先确认当前在 `release` 分支, 并且工作树干净:

```powershell
git status -sb
```

为版本创建 tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

创建 GitHub Release 时, 目标选择 `v0.1.0` tag, 标题建议使用:

```text
PostPilot v0.1.0
```

发布说明必须准确列明本次实际功能, 不要空白, 不要与代码变更不符。安装包附件从 `dist-release` 目录上传。

如果使用 GitHub CLI, 可先创建草稿发布:

```powershell
gh release create v0.1.0 dist-release\PostPilot-0.1.0-x64.msi --target release --title "PostPilot v0.1.0" --notes-file RELEASE_NOTES.md --draft
```
