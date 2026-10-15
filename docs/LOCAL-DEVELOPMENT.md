> 本文保留本地运行、隧道调试和协议验收方法；长期线上部署以根目录 README 和 CLOUDFLARE.md 为准。

# Vocabulary Context

首版面向 ChatGPT 电脑桌面应用和平板 App：暖绿色阅读界面、同一份词库、自然阅读与宿主英语交流。电脑运行 MCP 服务并保存数据；文章、释义、图片识别、句子分析与交流全部使用**当前宿主订阅模型**，服务器没有模型 API 客户端，没有模型密钥，不产生服务器模型调用费用。

**核心闭环已在 ChatGPT Work 桌面宿主实测；独立 ChatGPT 桌面客户端和平板 App 尚未单独验收。** 请先看 [当前验收记录](docs/ACCEPTANCE.md)。本地浏览器只是 MCP Apps 协议测试环境，不是另一个产品网站。

日常使用：先启动 `scripts/Start-SecureConnection.ps1`，再在 ChatGPT 选择已连接的插件（当前显示名为 `Test`）。说“打开我的词库”，然后加入单词并在界面确认；说“用今天的词写一篇关于 AI 与大学学习的文章”，或点击生成。文章保存后点击词可立即查义；选同一组词即可独立开始英语交流。

服务运行在这台电脑上，本机入口是 `http://127.0.0.1:8787`，ChatGPT 使用 `mcp.json` 中的 HTTPS `/mcp` 地址。学习数据库是项目 `data/vocabulary.sqlite`；登录配置在项目 `.env`，授权记录在 `data/auth.sqlite`。电脑、服务与隧道需要持续运行。


## 已实现

- 手动/批量导入、宿主图片识别后的逐项确认、重复词降级提示和恢复；真实保存、事件撤销、请求去重。
- 五档熟练度、搜索、时区日期与等级组合筛选、反复遗忘、暂停自动旧词；今日/手动/自动来源及换批。
- 独立阅读与交流：主题/篇幅/难度/句法、负载和分篇建议；宿主准备→生成→位置标注→校验修复→保存→阅读。
- 具体出现位置的预存中文释义、轻微目标词提示、键盘与触控、明确反馈和撤销、阅读位置与历史恢复、按需句子结构。
- SQLite WAL、版本冲突保护、OAuth 2.1/PKCE、电脑 HTTPS 安全转发脚本、一致性备份与完整恢复。

词形覆盖使用保守的常见名词/动词变化规则。不做激进词形还原；未知不规则变化应让宿主改用目标原词。负载是程序估算，写作说明是宿主审阅，不是考研质量评分。主数据无自动后台云同步，两端打开/刷新/保存后读取同一服务。

## 启动与停止（本机 Windows）

需要 Node.js 24+；依赖已经安装。首次在项目目录执行 `npm ci`、`npm run build`。日常使用以下脚本，不设置开机启动，不弹出额外服务窗口：

```powershell
./scripts/Start-SecureConnection.ps1
./scripts/Status-VocabularyContext.ps1
```

启动器先生成只保存在本机 `.env` 的词库登录密码，再启动 loopback 服务及已安装的 `cloudflared`。随后把实际 HTTPS origin 写入配置并重启服务。**数据库不随地址变化。** 已在当前网络实测 HTTPS、匿名 401、OAuth/PKCE、29 个 MCP 工具和界面资源读取。

停止外网转发或整个服务：

```powershell
./scripts/Stop-SecureConnection.ps1
./scripts/Stop-VocabularyContext.ps1
```

仅本机开发可运行 `./scripts/Start-VocabularyContext.ps1` 或 `npm start`。设置、运行 PID 和日志位于项目内 data 目录，密码不写日志。启动脚本保留已有 `.env`，不重置词库。若 PowerShell 被组织策略阻止，请在允许的终端运行 `npm start`，不要修改安全策略绕过。

电脑必须开机、联网并保持服务与连接运行；休眠、关机、断网或停止后，平板无法读写。页面保留当前未提交输入和配置，显示真实失败。临时 Quick Tunnel 不需账号或域名，但无 uptime 保证，停止失效、重建地址变化。[Cloudflare 官方限制](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。没有开通付费托管、域名或模型服务。

## 连接和安装到 ChatGPT

1. 运行启动脚本，使用状态脚本或 `mcp.json` 中的**当前实际 HTTPS `/mcp` 地址**。需要时执行 `node --env-file-if-exists=.env scripts/check-connection.mjs` 做只读连接检验。
2. 打开账号的 [ChatGPT Plugins](https://chatgpt.com/plugins)，选择 **+ → Add custom MCP server → URL**，输入地址，认证选 **OAuth / Dynamic Client Registration**。完成风险确认及 **Create as a plugin**。账号/workspace 的创建权限和 rollout 仍需实际确认。若桌面没有创建入口，可在账号网页注册，再回桌面 App 使用；网页注册不代替桌面使用验收。[官方步骤](https://developers.openai.com/plugins/deploy/connect-chatgpt)。
3. 授权页输入本机 `.env` 中 `VOCAB_OWNER_PASSWORD` 的值。不要把密码发给模型或贴到聊天中；该密码只用于个人词库登录，不是 OpenAI 凭据。服务只接受配置的精确 ChatGPT callback。
4. 安装插件，在新聊天中 `@Vocabulary Context`。服务器发布了 Skill 导入扩展与 Skill resource；需要把本包 Skill 一起安装/导入，不能仅凭工具连接声称 Skill 已激活。桌面可通过已注册的 `vocabulary-context-local` 本地来源安装 Skill 包；注册后可执行 `node scripts/bind-chatgpt.mjs <实际技术ID>` 关联，再重新打包。远程 MCP 的已注册技术 ID 绑定方式见 [连接说明](docs/LOCAL-CONNECTION.md)。**本地目录不能被平板读取。** 平板使用同一账号/workspace 的远程插件。
5. 说“加入 compelling、retain、diminish、impose、conventional”，在导入界面核对并确认，再选词。说“用这组词写一篇 AI 与大学学习的短篇文章”或点击生成。按钮使用标准 `ui/message` 发到当前宿主；宿主生成并调用 `validate_article` / `save_article` 后才展示文章。没有自动调用宿主模型的普通 MCP 工具，没有复制提示词到另一个聊天的流程。
6. 桌面 Work 宿主已验证连接、词库、文章生成/重开、逐处查词和反馈撤销。独立 ChatGPT 桌面客户端与平板 App 的真实安装验收仍未完成。Voice 中调用插件工具也未验证；文字交流上下文的宿主承接已验证，实际用户发言记录仍需真实交流后产生。

宿主若不支持消息触发、附件或 UI，界面会保留任务并明确提示；不会生成假文章。官方支持与实际验证的区分见 [宿主支持记录](docs/HOST-SUPPORT.md)。

## 数据、备份与迁移

当前数据目录：项目目录下的 `data/`，默认使用项目目录下的 `data`，配置为 `VOCAB_DATA_DIR=./data`。相对路径以项目根目录为基准，不依赖从哪个文件夹启动。`vocabulary.sqlite` 保存词条、熟练度、事件、请求去重、目标组、文章、逐处释义、交流及界面偏好。`auth.sqlite` 保存 OAuth 连接记录。该目录已排除在版本控制和插件安装包之外。配置可以通过 `.env` 的 `VOCAB_DATA_DIR`、`VOCAB_PUBLIC_URL`、`VOCAB_OWNER_PASSWORD`、`VOCAB_REDIRECT_URIS` 隔离调整。

```powershell
node --env-file-if-exists=.env scripts/backup.mjs --out D:/VocabularyBackups/backup-2026-10-14
# 恢复前停止服务；默认禁止覆盖现有词库。
node --env-file-if-exists=.env scripts/restore.mjs --from D:/VocabularyBackups/backup-2026-10-14 --data-dir D:/VocabularyRestored
```

备份可在线一致完成，带格式版本、数据版本和 SHA-256；包含所有学习 ID/事件/文章/释义，不导出密码或 OAuth 令牌。恢复检查完整性、拒绝较新 schema、要求服务停止。显式 `--replace` 会保留覆盖前的数据库文件，避免无保护替换。第二阶段只需在服务器部署同一服务、恢复备份、设置固定 HTTPS/数据目录/认证并重新授权，不重写业务与 UI。详见 [迁移说明](docs/MIGRATION.md)。

## 开发验收与打包

```text
npm test
npm run test:ui
npm run package
```

`dist/vocabulary-context-0.1.2.zip` 包含根 `plugin.json`、`mcp.json`、Skill、服务和自包含 MCP App UI；不含 `.env`、数据库、令牌、日志、node_modules 或测试文章。连接地址重建后重新打包；安装包不是持续在线服务。官方 Plugin/MCP canonical schema 已实际检查。

开发截图和测试输出已清理，不进入安装包。运行 `npm run test:ui` 可重新生成 `docs/previews` 和 `test-results`；这些输出不属于学习数据。
