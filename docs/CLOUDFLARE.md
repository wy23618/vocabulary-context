# Vocabulary Context · Cloudflare

## 当前状态（2026-10-15）

本地 41 项业务/认证/协议测试、19 项 UI 验收通过。Workers 打包通过；真实 Workers 运行时已验收 OAuth / PKCE、MCP 工具、词库写入、版本冲突回滚与 UI/Skill 资源读取。首次线上部署与现有词库迁移尚未完成。

默认 MCP 目标：`https://vocabulary-context.hellovian.workers.dev/mcp`。此为部署目标，不代表服务已上线。

## 架构与发布

Cloudflare Workers 提供 HTTP / MCP / OAuth，SQLite Durable Object 保存个人词库及授权记录。复用现有领域服务和 Repository 操作，通过注入 Durable SQL 替换本地文件生命周期。`node:sqlite` 只用于本地模式；Workers 不依赖临时文件保存学习数据。

每个部署实例是一份个人词库，没有多用户租户隔离。不要把自己的密码分享给体验者。UI 作为自包含 HTML 模块随 Worker 部署，通过 MCP resource 提供，不是匿名访问学习数据库的网站。

```sh
npm ci
npm run build
npm test
npm run test:cloudflare
npx wrangler secret put VOCAB_OWNER_PASSWORD
npm run deploy
```

在 `wrangler.jsonc` 设置实际 `VOCAB_PUBLIC_URL` 和精确 `VOCAB_REDIRECT_URIS`。密码至少 20 字符，仅放在 Worker secrets。本地 `.dev.vars` 示例见 `.dev.vars.example`；不要用临时 Tunnel origin 发布正式 OAuth discovery。

## 连接与验收

- GET `/health` 返回 200，`login_configured` 应为 true。
- 匿名 POST `/mcp` 返回 401，并携带 OAuth metadata challenge。
- 检查 OAuth discovery 的 issuer、resource 与 HTTPS origin 一致。
- 在兼容宿主重新连接 `/mcp`，完成 OAuth / PKCE，确认工具、UI 和保存后重开。
- 宿主 Skill 安装单独验收，浏览器协议测试不代表所有宿主已支持。

本机 `.app.json` 是个人 connector 绑定，不进入 Git；需要时运行 `scripts/bind-chatgpt.mjs` 绑定自己的实际技术 ID。发行包应将 `mcp.json` 配置为部署者自己的服务地址。

## 数据迁移与恢复

代码推送不携带 `data/`，因此首次新云库为空。本地词库不受部署影响。先用现有 `scripts/backup.mjs` 创建一致性备份并验证 manifest / SHA-256；迁移必须保留 words、events、objects、requests 的 ID、版本、文章与逐处释义，不能用“重新加词”替代完整恢复。

新增 `cloudflare/migrate.mjs` 与独立维护通道支持空库恢复，已在 Workers 运行时验证约束失败回滚和重复导入拒绝。本地词库已生成一致性私有备份，并已在隔离 Workers 实例验证完整导入、SHA-256 回执及逐表行数一致；真实云端导入与重连仍待完成。OAuth 记录不随词库迁移，新服务应重新授权。

## 自动发布

仓库的 `.github/workflows/deploy.yml` 在 pull request 执行检查，在 `main` 的 push / 手动运行检查通过后执行正式发布。请勿同时启用两个互相覆盖的发布系统。

需要在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

- `CLOUDFLARE_ACCOUNT_ID`：你自己的 Cloudflare Account ID。
- `CLOUDFLARE_API_TOKEN`：仅具备目标账号所需 Workers 发布权限的 API Token。不要把 token 放在代码、聊天或 README 中。

Worker 运行时密码与密钥通过 `wrangler secret put` 管理，不放在构建变量、前端 bundle 或仓库文件中。Cloudflare 插件、Wrangler 本地登录和 GitHub Actions 发布凭据是三种独立授权，不能假定其中一次登录会自动配好另外两者。

日常流程：本地修改 → 本地检查 → `git add .` → `git commit` → `git push` → GitHub Actions 检查 → Wrangler 发布 → 检查正式 HTTPS 地址。发布失败时保留上一线上版本，修复后再次 push。

## 成本与数据边界

配置面向 Cloudflare 免费能力，没有启用付费订阅或自动扩容。实际使用受账号配额限制；平台要求开通付费能力时应停止并由所有者决定。

不要重命名已有 Durable Object 类、迁移标签或数据实例名称来“修复部署”；这可能产生新的空数据空间。代码发布不等于现有数据迁移，不要删除旧库或覆盖正式用户数据。

## 一次性空库迁移工具

迁移凭据 `MIGRATION_TOKEN` 至少 43 字符随机值，需同时通过私有环境变量传给本地工具和 Worker secret。未配置时维护入口返回 404。工具不会把凭据打印出来。

```sh
# 在服务的 npm 项目目录执行；Foclo 需先 npm run build
node --env-file=.env cloudflare/migrate.mjs export data/cloudflare-backup.json
node --env-file=.env cloudflare/migrate.mjs import data/cloudflare-backup.json https://YOUR-WORKER.workers.dev
# 验证后立刻删除临时维护凭据
npx wrangler secret delete MIGRATION_TOKEN
```

导出不覆盖已有备份；导入检查 SHA-256、格式、schema、外键和表行数，只接受全空的目标库，成功后写入单次导入回执。再次导入或已有数据均拒绝，校验失败在事务中回滚，不做覆盖删除。备份含个人数据，应留在被忽略的 `data/`，不要上传到 GitHub。
