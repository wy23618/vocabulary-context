# 电脑托管与两端连接

2026-10-14（Asia/Shanghai）。第一版由用户电脑运行服务、保存词库，不部署云端业务或数据库。平板通过 ChatGPT 的远程 MCP 连接访问这台电脑上的同一份数据，不读取电脑本地文件、不直连电脑 localhost。生成仍由当前 ChatGPT 宿主订阅模型完成。

本次实际读取了官方 [Secure MCP Tunnel Markdown](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md)、[隧道指南](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)、[添加自定义 MCP](https://developers.openai.com/api/docs/guides/custom-mcp-server)、[插件连接测试](https://developers.openai.com/plugins/deploy/connect-chatgpt)及 [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。本机 `Get-Command tunnel-client` 未返回可用命令；已核实 `C:/Program Files (x86)/cloudflared/cloudflared.exe` 存在。本审计 agent 没有启动隧道，实际连接测试由运行测试报告单独记录。

**首版个人测试选择：现有 cloudflared 的整站 Quick Tunnel + 当前服务 OAuth。** 这样 MCP、登录页面和 token/discovery 同一 HTTPS origin，电脑保存全部业务数据，不需要云端业务部署。官方 Secure MCP Tunnel 的账号关联/连接凭据目前未配置，且不自动代理 OAuth；留作以后可选路径。

实际连接更新：早期 530 / 1033 已解决。主开发 agent 使用任务专用 `{}` cloudflared 配置，明确 `--protocol http2 --edge-ip-version 4`，建立新 Quick Tunnel；`scripts/check-connection.mjs` 已在 **https://subsequently-javascript-concert-one.trycloudflare.com/mcp** 通过匿名 401、OAuth/DCR/PKCE（含 issuer）、29 个工具发现、只读 `open_workspace`、阅读组件 resource 读取以及测试 token 撤销。没有加入/修改正式词库。该地址是本次临时进程地址，不是长期服务承诺。**这是远程服务协议验收，ChatGPT 桌面/平板实际安装、UI宿主运行与 Voice 仍未验证。**

## 必须区分的三条路径

| 路径 | 实际作用 | 能否据此宣称平板已可用 |
|---|---|---|
| 电脑 localhost | 开发与本地协议/harness 验证 | 不能，平板 localhost 指向平板自身 |
| 官方 Secure MCP Tunnel | tunnel-client 出站轮询 OpenAI，将 MCP 请求转发到电脑 HTTP/stdio 服务 | 官方支持私有 MCP 连接；须配置关联、鉴权并实测目标 App |
| 临时 HTTPS 转发 | 用可公开访问的 HTTPS 地址转发到电脑同一服务，可覆盖 MCP + OAuth 页面/metadata | 可作为个人测试访问路径，仍须认证、两端真机实测；不保证永久免费/长期地址 |

这里的“远程”表示 MCP 传输路径，不表示把词库迁移到云服务器。所有路径都要求电脑开机、网络可达及服务持续运行。插件卸载和升级不能删除词库；具体本地数据目录由项目配置确定。

## 首版 Quick Tunnel：准确操作与限制

Cloudflare 官方说明此模式不需要账号或域名，是测试/开发临时地址，没有 uptime 保证；每次重建 hostname 会变化，停止进程即失效。不把这称作长期免费部署。传输走第三方隧道，但数据库仍在电脑。[Quick Tunnel 官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

1. 先确认本地业务服务使用 loopback 监听、词库密码已安全配置、`/mcp` 匿名请求返回 401。没有匿名词库数据入口后再开隧道。
2. 本机工具的手工启动形式（示例端口以实际配置为准）：

```powershell
& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' tunnel --url http://127.0.0.1:8787
```

3. 从该进程实际输出取得 `https://…trycloudflare.com`，将其设为 `VOCAB_PUBLIC_URL`，重启本地业务服务；保持同一 cloudflared 进程运行。配置不能用虚构域名或旧输出。只暴露这个 HTTP 服务，不代理词库目录、开发 harness 或电脑文件。
4. 核对 public `/health`、protected-resource metadata、issuer、authorize/token/register URL 和匿名 `/mcp` 的 401 challenge；resource 应为实际 HTTPS `/mcp`。用真实授权的 MCP 客户端读写测试，检查无凭据不能读词库。
5. 在 ChatGPT Plugins 创建 **URL 连接 + OAuth**，地址为实际 HTTPS `/mcp`，完成用户授权，安装再在桌面和平板同一账号中调用。这里不是 Connection: Tunnel，也不填 OpenAI tunnel_id。
6. 地址变化时重复 publicUrl/issuer 配置、连接刷新/重建与授权核对。原电脑数据库保留；旧登录 token audience/issuer 不应被默默接受为新连接。停止隧道就是撤销这个临时公网入口，不需要卸载词库。

Quick Tunnel **不支持 SSE**，故项目采用 `StreamableHTTPServerTransport` 的 `enableJsonResponse: true`；必须实际验证 ChatGPT 客户端用这种 JSON Streamable HTTP 正常调用。页面规定最多 200 个 in-flight 请求，过量返回 429。[限制说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。宿主模型耗时生成在 ChatGPT 当前对话中执行，不通过服务器长请求等待模型。

不要给整条 MCP 路由加 `--allowed-mail` 的邮箱 PIN 门槛：官方说明该门槛需要交互浏览器，不支持非交互客户端，会影响 ChatGPT MCP 调用。当前应用自己的 OAuth 仍负责词库读写保护。隧道仅启动临时测试，不设置系统自动启动、不购置域名或命名隧道；长期稳定连接需后续单独决定。

## 官方隧道：前置条件

- 在目标个人 Platform organization / 组织中创建 `tunnel_id`；创建/编辑需 Tunnels Read + Manage，运行 client 或选择隧道需 Read + Use。
- 隧道关联正确的 ChatGPT account/workspace，不能只关联另一 Platform organization。企业映射无法自动确认时，官方要求支持团队核对关联。
- 设置 tunnel-client 的**连接 runtime key**，仅用于隧道控制面，不用于模型推理，也不允许提取 ChatGPT 订阅登录 token 来代替。实际秘密由用户在本地安全输入/环境引用设置，不写聊天、命令参数、日志或包文件。
- 电脑能出站 HTTPS 到官方文档列出的 tunnel 控制面，并能访问电脑本地 MCP；ChatGPT workspace 允许自定义 MCP，相关安全设置未禁止。

官方文档没有在此承诺隧道服务永久免费，故不把它称作免费长期托管。此路径也不支持公开插件提交/分发；个人测试和公开目录发布是不同事项。

## CLI 安装与配置（尚未实际执行）

1. 使用 Platform 隧道设置里的官方下载链接，或该官方页面指向的 `openai/tunnel-client` latest release，选适用于电脑操作系统/架构的版本。不猜测一个不存在的包管理安装命令，不硬编码旧 release。
2. 在允许的终端运行 `tunnel-client help quickstart`，以已下载版本实际帮助确认 profile 参数。
3. 项目当前是 **HTTP MCP 服务**，应使用 `--mcp-server-url` 指向电脑监听的 `/mcp`，而不是 `--mcp-command`。先确认服务监听地址和授权模式。官方文档示例允许 stdio profile 的初始化流程；HTTP 模式将 command 参数替换为 server-url，示例名和其他选项应以本机 CLI help 为准。
4. 官方 stdio 示例为：

```text
tunnel-client init --sample sample_mcp_stdio_local --profile local-stdio --tunnel-id <实际 tunnel_id> --mcp-command "<实际 stdio server command>"
tunnel-client doctor --profile local-stdio --explain
tunnel-client run --profile local-stdio
```

HTTP 服务相应的关键参数为 `--mcp-server-url http://127.0.0.1:8787/mcp`；端口以项目当前配置为准。不要直接运行 stdio 示例来启动没有实现的 stdio server。缺少 CLI / profile / tunnel_id / runtime 连接凭据时只列出缺项，不伪造 doctor 成功。

5. 用 `doctor --profile <实际 profile> --explain` 检查关联和连接；启动 client，检查 `/healthz`、`/readyz` 及默认 loopback `/ui` 的 readiness/active polling。默认 admin UI 不对公网开放。
6. ChatGPT Plugins → + → Add custom MCP server → Connection: Tunnel → 选择同一隧道或填实际 ID → 配置认证 → Create as a plugin → 安装。官方 custom MCP 页面把**创建连接**的访问路径写为 ChatGPT web；如桌面 App 没有创建入口，可通过账号 Plugins 网页完成注册，再回实际桌面 App 使用。注册网页成功不能替代桌面 App 真机使用验证。

## OAuth 不能被误当成已随隧道解决

官方 Markdown 的 OAuth 段明确：discovery 可经过隧道，隧道保留上游 authorization server metadata，但 **authorization server 本身不会自动被 tunneled**。

当前项目同一进程同时提供 MCP、`/.well-known/oauth-protected-resource`、authorization discovery、`/oauth/register`、`/oauth/authorize`、`/oauth/token`。`VOCAB_PUBLIC_URL` 决定 resource/issuer 和 OAuth URL。保留 `http://127.0.0.1:8787` 仅适合本地开发：平板授权浏览器访问这个地址会访问平板自己；OpenAI token exchange 也不能假定访问电脑 loopback。

要维持当前 OAuth 保护，必须提供一个**实际可达、公开 HTTPS issuer**用于 authorization 页面及 token/registration/discovery。可用个人电脑上的受保护 HTTPS 转发实现，不要求把数据搬到云端；也可采用独立可达的既有授权服务，但需架构和权限对齐。MCP resource canonical ID、protected-resource `authorization_servers`、issuer、浏览器授权 endpoint 和 token endpoint 都要与实际路由一致。

不能把 OpenAI tunnel endpoint 偷换成应用自己的 issuer，也不能只填 tunnel_id 就把 `VOCAB_PUBLIC_URL` 当作已正确配置。官方 tunnel transport 的 workspace 访问控制不自动等于应用 OAuth；若以后选择仅依靠隧道组织/workspace 保护，需要独立确认并实施该受控认证模式，不能在现有服务上直接移除鉴权。

### 包配置与 OAuth discovery 的兼容处理

本次已读取 Agent Plugins MCP 1.0.0 [canonical schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)：HTTP server 允许 `type`、`url`、可选 `headers`，并禁止额外属性。OpenAI [包装文档](https://developers.openai.com/plugins/build/plugins) 却展示 server `extensions.com.openai.auth`。为保持 portable schema 合格，当前包不添加这项扩展；OAuth 仍由服务的 HTTP discovery / DCR / PKCE 和 ChatGPT 连接设置实施。匿名 MCP 仍要求 401，不能因为 manifest 没有 auth 字段而降为无鉴权。该规范差异没有建立“包已经真实安装成功”的证据。

两个明确实现选择：

- **当前 OAuth 服务 + 临时整站 HTTPS 转发**：最少改动，电脑保存数据；将 `VOCAB_PUBLIC_URL` 设置为实际 HTTPS origin，重启服务，核对 metadata 和回调；ChatGPT 直接连接该 HTTPS `/mcp`。不额外需要 official tunnel-client。
- **官方 MCP Tunnel + 可达 HTTPS OAuth issuer**：MCP 在官方隧道内走，OAuth 登录/交换走可达 origin；须额外验证 endpoint、resource 和 issuer 发现，配置步骤更多。

本审计 agent 只核对支持、更新文档与记录主开发 agent 的实际连接证据，没有自行启动隧道。

## 注册后的 Skill 包绑定

ChatGPT 创建自定义连接后才能得到真实注册技术 ID。portable 根 `plugin.json` 用 `extensions.com.openai.apps: "./.app.json"` 引用注册映射；`mcp.json` 的 endpoint 配置和这个账号注册身份是不同层级。参考 [官方包装说明](https://developers.openai.com/plugins/build/plugins)、[注册引用校验](https://developers.openai.com/plugins/deploy/submission-errors)。

根 `.app.json` 形状如下，尖括号是待填写说明，不是有效注册 ID：

```json
{
  "apps": {
    "vocabulary-context": {
      "id": "<实际注册的 asdk_app_... ID>",
      "required": true
    }
  }
}
```

官方包装页描述浏览器技术 ID 以 `plugin_asdk_app` 开头，而引用校验要求 entry `id` 以 `asdk_app_`、`connector_` 或 `templated_apps_` 开头。本机已安装的个人 MCP 包也使用 `asdk_app_` 映射。因此绑定必须从**用户真实完成注册的连接**取得对应 server ID；如果输入是 `plugin_asdk_app_…`，只将已取得的 ID 去除前缀 `plugin_` 后按规范映射，不能生成随机 ID、借用别的已安装 connector 或把示例 ID写进可安装包。绑定后核对同一 OAuth 连接与服务器，并真实验收 Skill 激活。

这个 registered reference 适用于个人 local/workspace 包；公开 submission portal 不发布现有 app references，应走 With MCP。portable 包的 `mcpServers` 来自根 `mcp.json` 自动发现，不在 `com.openai` 下再声明一个替代路径。尚未注册时不放假的 `.app.json`，以已配置 HTTP 服务可用与待宿主注册分开交付。

## 两端同一连接的验收

官方 [Plugins](https://learn.chatgpt.com/docs/plugins) 说明移动 App 可以使用账号可用的插件；Desktop only 本地执行包不支持移动端。因此将**远程自定义 MCP 连接**添加到同一账号/workspace，不把电脑 stdio 插件当作平板包。平板实际能否选择该个人隧道插件、展示 MCP App UI、保持授权，仍须目标设备验证；官方隧道页未逐个保证 iPad / Android 型号。

验收需依次保留证据：电脑服务及持久化目录 → tunnel/proxy readiness → ChatGPT 安装/实际工具调用 → 桌面新增唯一词 → 平板读取 → 平板实际文章阅读与反馈 → 桌面读取事件更新。电脑离线后应显示真实连接失败而非缓存成功，恢复连接后仍能重开原文章。

只完成 HTTP 两客户端、MCP Inspector、UI harness 或代表性平板尺寸测试，应分别命名“共享服务验证”“协议验证”“布局验证”；不能命名“真实 ChatGPT 平板已通过”。现有 Windows computer-use guidance 禁止自动化 ChatGPT 桌面 UI，见 [宿主支持记录](./HOST-SUPPORT.md)，本轮不通过该工具绕过。

## 外部阻塞核对表

| 条件 | 本次状态 | 后续动作 |
|---|---|---|
| 电脑业务服务/SQLite | 由运行测试报告记录 | 不因隧道配置缺失停止本地开发 |
| tunnel-client / tunnel_id | 本机命令未发现，ID 未配置 | 用户账号获授权后下载/配置实际版本 |
| Platform/ChatGPT 关联、Read/Manage/Use | 未核实 | 目标组织/workspace 设置中确认 |
| 隧道控制面 runtime 连接凭据 | 未配置 | 本地安全输入，禁止提取订阅 token |
| 可达 HTTPS OAuth issuer 或临时转发地址 | 当前 Quick Tunnel + OAuth/PKCE + 28 tools/UI resource 已实际验证 | 保持电脑服务与隧道进程在线；地址变化重新配置授权 |
| ChatGPT 创建权限/插件注册技术 ID | 未核实 | 注册后记录真实 ID，再组合 Skill 包 |
| 真实桌面和平板 App | 未验证 | 人工/允许的目标宿主测试能力操作 |

以上全部完成并实际工具调用成功之前，连接与安装状态保持“待外部配置/未验证”。模型生成不依赖额外的付费模型配置。
