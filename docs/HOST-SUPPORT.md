# Vocabulary Context：宿主支持核对

核对日期：2026-10-14（Asia/Shanghai）。本文件区分“官方文档支持”“本地协议/布局验证”和“目标 App 实测”。官方支持不等于当前账号、具体 App 版本已经可用。

最新平板用户实测：用户截图显示 `Test` 工具已返回三个词，组件却显示“出了点问题”。平板工具读取已有证据，UI 加载失败，当前不属于完整可用状态。0.1.2 恢复 v1/v2 资源读取并发布 v3，补全官方兼容 metadata，使用默认 ChatGPT sandbox，记录不含凭据或学习正文的资源读取日志；36 项协议/业务检查通过，HTTPS 上三代资源均可读。是否解决该平板客户端报错仍需用户点重试后复核。

## 架构结论

采用 **Plugin + skills + 可远程连接的 Streamable HTTP MCP + 电脑持久化数据 + MCP App UI**。按用户后续要求，首版由电脑托管、不部署云端业务数据库；通过官方 MCP Tunnel 或经配置的 HTTPS 转发供两端同一账号连接，详见 [电脑连接说明](./LOCAL-CONNECTION.md)。不采用旧 `ai-plugin.json`，不依赖平板读取电脑文件或访问电脑 localhost。官方说明 Plugins 可在 ChatGPT 的 Chat / Work 中跨 web、desktop、mobile 使用；移动端可使用账号可用的插件。标记 Desktop only 的本地执行包不适合本项目的平板要求。[Plugins 用户文档](https://learn.chatgpt.com/docs/plugins)、[Desktop-only 插件](https://developers.openai.com/plugins/deploy/desktop-only)。

**Windows 桌面窗口中的 ChatGPT Work 宿主连接、词库、阅读 UI、查词与反馈已实测，见 [桌面验收](DESKTOP-ACCEPTANCE.md)。窗口运行在 OpenAI.Codex 包中；独立 ChatGPT 桌面客户端和平板 App 均未单独验收，Voice 也未验证。** 浏览器、模拟宿主与代表性尺寸测试必须另记，不能代替目标 App 验收。

**补充实测（2026-10-14）：** 已在 ChatGPT Work 的 Codex 内置浏览器会话实际打开已连接的 `Test` MCP App，完成加词、订阅模型生成、校验、文章保存与阅读、逐处释义和熟练度反馈。该会话证明此账号的这条内置浏览器路径可用；它仍不能代表独立 ChatGPT 桌面 App、平板 App 或两端同步。

## 支持矩阵

| 能力 | Windows 桌面 ChatGPT Work 宿主 | ChatGPT 平板 App | 本次核对结论 |
|---|---|---|---|
| 远程插件/MCP 工具 | Work 宿主实际连到本机服务并读取数据 | 官方移动端可使用账号已有插件 | 当前账号/此桌面 Work 环境已验证；独立 ChatGPT 桌面客户端、平板 App 尚未实测 |
| 自定义 MCP 连接 | 官方流程为 Plugins → + → Add custom MCP server | 移动端直接创建连接的操作路径未被本次文档明确保证 | 优先在桌面/账号 Plugins 创建并安装，再核对平板同账号可用性 |
| MCP App UI | Work 中的内嵌 UI 实际显示并完成查词/反馈 | 官方要求插件 UI 在 desktop 与 mobile 可靠运行 | 独立 ChatGPT 桌面客户端和平板型号仍需真机确认 |
| UI 调工具 | `tools/call`，工具 `ui.visibility` 含 `app` | 通过同一能力协议；不能仅凭屏幕尺寸推断可用 | 运行时检查 bridge / capabilities，失败明确提示 |
| 图片识别与确认 | file params 与可选上传扩展有官方接口 | 具体移动文件选择器、扩展可用性未实测 | 接收真实文件，再识别，再确认；不直接保存 |
| 文章重新打开/恢复 | 服务端保存业务数据，UI 恢复展示状态 | 同一账户映射至同一服务端数据 | 必须验证两端读写同一词库；widgetState 不是数据库 |
| 文字交流带入目标词 | `ui/message` | 真实 Work 对话已收到与按钮等价的准备消息；没有用户答复，故未记实际使用 | 准备阶段不计交流次数；仅真实话语命中才记录 |
| Voice 承接与使用记录 | 当前 Voice 文档说明桌面 Chat / Work / Codex 和账号限制 | 文档提到 iOS 配对桌面访问，未建立独立平板 Voice + 本插件工具的完整保证 | **未接通、未验证；不能宣称支持 Voice 工具调用与自动记录** |

矩阵依据：[ChatGPT Plugins](https://learn.chatgpt.com/docs/plugins)、[UI 指南](https://developers.openai.com/plugins/build/chatgpt-ui)、[插件质量要求](https://developers.openai.com/plugins/plugin-guidelines)、[Voice](https://learn.chatgpt.com/docs/features/voice)。

## 当前包装与 UI 协议

新包使用根 `plugin.json`（Agent Plugins schema）、`skills/`、根 `mcp.json`（每个 server 明确 `type: "streamable-http"`），OpenAI 展示与注册服务映射放在 `extensions.com.openai`。`.codex-plugin/plugin.json` 是兼容格式；文件升级需遵循 schema，不能只重命名旧 `.mcp.json`。[包装说明](https://developers.openai.com/plugins/build/plugins)。

**规范差异（2026-10-14 核对）：** OpenAI 包装文档在 `mcp.json` 的 server 下展示 `extensions.com.openai.auth`；但实际读取的 [Agent Plugins MCP 1.0.0 canonical schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json) 对 `streamableHttpServer` 仅允许 `type`、`url`、`headers`，且 `additionalProperties: false`。这两处当前不一致。本项目 portable `mcp.json` 因而保留通用规范允许的 transport/URL，不放 server extensions；**这不是关闭 OAuth**。服务仍返回 401 Bearer challenge、protected-resource/authorization metadata，支持 DCR + PKCE，并在 ChatGPT 创建连接时选择 OAuth。schema 合格、认证服务可用与宿主真实安装分别验收，不能相互替代。根 `plugin.json` 的 OpenAI 展示 extensions 与此 server schema 差异是不同层级。

新 UI 使用 `_meta.ui.resourceUri`，资源 MIME 为 `text/html;profile=mcp-app`。iframe 通过 MCP Apps JSON-RPC `postMessage` 完成 `ui/initialize`、工具结果通知和 `tools/call`。开始交流通过 `ui/message` 自动发送完整准备消息，要求文字只回复“好，我们开始吧。”，指定开场白留到手动启动语音后的第一次回应。插件 UI 是宿主内局部工具界面，不是另外部署一个聊天网站。[MCP UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)、[UI 接入说明](https://developers.openai.com/plugins/build/chatgpt-ui)。

`window.openai.requestDisplayMode` 可请求 fullscreen；不能假定任意容器/设备一定授予某模式。布局按实际容器宽度响应。Composer mentions 属于桌面扩展，不能作为平板核心流程的必要条件。[UI reference](https://developers.openai.com/plugins/reference)、[Plugin Extensions](https://developers.openai.com/plugins/build/extensions)。

## 图片输入路径

工具描述用 `_meta["openai/fileParams"]` 声明顶层文件字段。文件 schema 必须声明 `download_url`、`file_id`、`mime_type`、`file_name`，仅前两项在文件 object 内必填。宿主传入 snake_case 文件对象；下载 URL 是临时地址，不能当成永久图片存储。

UI 用户选择文件时，可检查 `window.openai.uploadFile` / `getFileDownloadUrl`；文件库 `selectFiles` 不是所有账号都有。无宿主扩展时使用明确的支持路径，不伪造识别结果。**识别由当前 ChatGPT 宿主模型完成**；工具接收识别条目和来源引用，仅保存导入草稿，确认工具再提交词库。[文件输入与上传接口](https://developers.openai.com/plugins/reference)。

## 唯一模型路径：当前 ChatGPT 宿主订阅

按用户后续最高优先级要求，文章、图片识别、语境词义及必要句法分析全部由当前 ChatGPT 对话模型完成。MCP 服务只负责准备真实数据、验证、保存和读取，不调用独立模型服务，不要求新增模型付费配置。订阅本身的额度与模型可用性仍由 ChatGPT 账号和宿主控制；不能宣称不限量或保证任意模型均能完整执行。

文章按钮的闭环为：

1. UI 调用 `prepare_article`，保存目标词、配置与唯一请求 ID，取得完整生成要求和严格 schema。
2. UI 使用 `ui/message` 发送完整准备消息并触发文字确认；原生语音是否承接该消息中的主题与开场白，仍需在真实宿主实测。[UI 标准与兼容接口](https://developers.openai.com/plugins/build/chatgpt-ui)、[ChatGPT 扩展 reference](https://developers.openai.com/plugins/reference)。
3. 模型读取 Skill / 生成要求，生成真实文章和每个出现位置的释义，调用 `validate_article`。校验失败应根据真实错误修复，然后重验；不得以示例文章或提示词代替结果。
4. 模型调用 `save_article`，服务重新校验并以同一请求 ID 幂等保存。UI 查询该请求的实际状态，只有读到已保存文章才显示完成并进入阅读。

上面是本产品的设计流程，**不是官方预制的文章生成服务**。官方支持 Skill 组织工具顺序、返回结构与修复策略，但模型的遵循程度和工具调用仍需真机验收。[Skill 工作流边界](https://developers.openai.com/plugins/build/skills)、[Skill 激活与 MCP 分工](https://developers.openai.com/plugins/concepts/skills)。

### 消息语义与完成信号

已核对项目安装的官方 MCP Apps SDK `@modelcontextprotocol/ext-apps` **2.0.3**：`McpUiMessageRequestSchema` 的 role 是字面值 `user`；`App.sendMessage` 返回可选 `isError`，**没有规范保证的 `accepted` 字段，也不返回生成文章或工具链完成承诺**。SDK `App.updateModelContext` 说明它仅更新后续回合上下文、不触发即时模型回应；`sendMessage` 则是触发后续对话的消息路径。以上 SDK 事实来自本地 `dist/src/app.d.ts` 和 `dist/src/generated/schema.d.ts`；OpenAI reference 只说明发送组件消息，不独立保证某 App 版本已自动继续并执行保存。

因此必须分别记录：消息发送响应、宿主是否开始当前对话的模型回合、是否调用 validate/save、已保存文章状态。消息无 `isError` 只表示未报告拒绝，不能显示“文章生成成功”。如果宿主拒绝/不支持 message、正在执行其他回合、审批待处理、用户停止模型或额度耗尽，UI 保留请求和配置，显示对应失败/等待状态，可重试或在当前宿主聊天继续相同请求。相同请求重试不得创建重复文章。**准备数据与复制指令可以是故障恢复入口，不能被算作生成验收通过。**

## 共享服务、身份与持久化

两端连接电脑上的同一个受保护 `/mcp` 服务（官方 tunnel 或 HTTPS 转发），服务把授权身份映射到同一个用户数据集合。词库、事件、目标组、文章及语境释义存于电脑配置的数据目录，不能放插件缓存、UI localStorage 或 widgetState。阅读位置、筛选和配置可保存为服务端偏好，组件只叠加临时状态。[跨设备状态](https://developers.openai.com/plugins/build/chatgpt-ui)。电脑必须保持开机、服务运行和网络连通。

个人数据和写操作要认证。官方认证路径为 OAuth 2.1 + PKCE、protected resource metadata、授权服务 discovery、每次请求验证 access token。回调应使用连接管理页实际显示的 URL；符合 issuer identification 条件时可使用稳定回调。不要把任意宿主 metadata 或 conversation ID 当作登录身份。[认证说明](https://developers.openai.com/plugins/build/auth)。

本地 bearer 测试不能直接说成 ChatGPT 安装认证成功；面向两端真实连接采用 OAuth。服务访问凭据用于保护词库，和模型调用无关，不能要求配置独立生成模型。[包装认证说明](https://developers.openai.com/plugins/build/plugins)。

个人电脑托管可使用官方 Secure MCP Tunnel，需要独立的隧道设置、组织/workspace 关联及持续运行的 client。它不是平板直连 localhost，也不支持公开插件提交/分发；电脑离线将阻断服务。OAuth discovery 可随隧道传输，但授权服务本身不自动代理，当前 localhost issuer 不能据此宣称平板可授权。详见 [本地连接与 OAuth 限制](./LOCAL-CONNECTION.md)、[Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。

首版个人测试选择已存在的 cloudflared **Quick Tunnel 整站 HTTPS 转发 + 当前服务 OAuth**，让 MCP 和浏览器登录/交换使用同一实际 origin，词库仍在电脑。该模式不需要 Cloudflare 账号或域名，但属于临时开发连接：无 uptime 保证、重建地址改变、停止进程失效且不支持 SSE；服务用 JSON Streamable HTTP，并以实际远程调用验证。没有设置开机自动启动或购买长期配置。[Cloudflare 官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

## 安装与真实验收仍需的外部条件

1. 电脑服务、持久化数据目录与备份；已配置的官方 tunnel 或 HTTPS 转发、可达 OAuth issuer，电脑在线。
2. 已登录且具有可用模型额度的 ChatGPT 宿主订阅；能在当前对话调用本插件工具并执行生成/校验/保存工作流。没有独立模型付费配置要求。
3. OAuth 配置、个人授权账号、当前 ChatGPT account/workspace 创建自定义 MCP 的权限；注册后技术 ID（如组合 skills 与已注册服务映射）。
4. ChatGPT 桌面 App 和平板 App 的真实登录会话与设备。当前环境没有目标 App 实测结果。

官方测试流程：先验证工具 schema、授权、MCP 资源，再在 Plugins 添加服务器、创建为插件、安装、开新对话并 `@` 选择。更新工具/资源后 Refresh 并新开对话。组合 skills 的完整包还需验证安装后技能与工具一起工作。[连接与测试](https://developers.openai.com/plugins/deploy/connect-chatgpt)。

真实跨设备验收顺序：桌面加入带唯一标记的词 → 平板读取同一条记录 → 平板打开保存文章并反馈 → 桌面重新读取确认等级与事件。分别记录客户端版本、服务部署版本、词/文章 ID 和成功结果。阅读侧栏、焦点、滚动稳定性、触控和容器变化在两个真实 App 中另测。仅 HTTP 两客户端测试应命名为“共享服务测试”，不能命名为“平板 App 已验证”。

### Windows 桌面最小真机流程

1. 在 **ChatGPT 桌面 App**（记录进程/客户端版本，不能以当前 Codex 开发聊天代替）登录目标账号，添加远程 MCP、完成 OAuth 并安装。新开 Chat 或 Work，`@Vocabulary Context` 打开界面。
2. 加入 `compelling, retain, diminish, impose, conventional`，确认保存。再次主动加入 retain，核对事件与降级，再恢复该事件。
3. 选中这些词，配置“AI 与大学学习”、标准篇幅、考研难度；点击生成。记录 message 的发送结果、当前聊天模型回合、validate/save 工具调用和实际 article ID。只返回请求文字视为失败。
4. 打开实际保存文章，点击 retain 的两个不同位置，核对位置释义。关闭/切换释义前后阅读位置不跳；键盘焦点能返回词；释义点击没有生成模型请求。
5. 关闭再开 UI，以 article ID 恢复文章和阅读位置；在平板同账号读取同一词库并反馈，回桌面确认持久更新。
6. 同一词组独立准备文字交流、在宿主正常交流，再记录实际 AI/user 使用；准备阶段计数仍为零。Voice 单列实测，失败不影响文字流程。

桌面实测已在当前电脑 OpenAI.Codex 26.1007.2314.0 的 ChatGPT Work 宿主中推进，具体通过项与限制见 [桌面验收](DESKTOP-ACCEPTANCE.md)。该窗口不是独立 ChatGPT 桌面客户端的充分证据，也不能把结果扩展为平板或 Voice 通过。

### Plugin Creator 与 Skill 安装边界

官方文档提供 `@plugin-creator` / `$plugin-creator` 的包装工作流，也明确允许手工创建 portable 包。[包装说明](https://developers.openai.com/plugins/build/plugins)。本次检查当前可用 skill 列表、工具元数据和本地 skills/plugin cache，**未找到可直接调用的 plugin-creator skill/tool**；已有 skill-creator 可用于生成 Skill。无须为此停工，可按官方 portable 包手工实现。

安装后模型先看到 Skill metadata，匹配请求后才读取正文；不能仅有服务器返回提示词就假设 Skill 已安装。若通过 MCP 在提交时导入 Skill，官方说明是提交草稿中的快照，运行时不会从服务器动态重新加载；更新 Skill 要重新导入/包装。[Skill 导入说明](https://developers.openai.com/plugins/build/skills)。真机还须观察 metadata 激活、完整 instructions/schema 读取、生成/修复/校验/保存，而非只检查文件存在。

## 状态记录规则

- **官方支持核对：已完成**（以上页面已实际读取）。
- **代表性尺寸测试：由 UI 测试报告据实记录**；本文件不提前给出合格结论。
- **Windows 桌面 ChatGPT Work 宿主：已验证文章生成/保存/重开、即时查词与反馈；独立 ChatGPT 桌面客户端未单独验证。**
- **真实 ChatGPT 平板 App：尚未验证。**
- **桌面 Work 文字准备消息：已验证；用户实际使用记录：尚未产生。桌面/平板跨端真机同步与 Voice 工具调用：尚未验证。**

连接进展更新（2026-10-14）：早期临时入口的 530 / 1033 已修复。当前 0.1.1 HTTPS `/mcp` 的匿名 401、OAuth/DCR/PKCE 与 issuer、29 个 MCP tools、`open_workspace`、v2 阅读 UI resource 已通过只读连接检查；Windows ChatGPT Work 宿主在服务停止时调用失败，重启后恢复。目标词、文章重开、即时释义、明确反馈/撤销和自然文字交流开场在该 Work 宿主环境有实际结果，见 [桌面验收](DESKTOP-ACCEPTANCE.md)。**没有独立 ChatGPT 桌面客户端的单独实测；真实图片附件上传和 Voice 工具调用仍未验证。** 临时地址随隧道重建改变，当前真实地址见配置及运行报告。

后续若完成真机测试，应新增带证据的日期记录，保留本次审计的边界。


## 2026-10-18：真实宿主的旧组件复现

在当前聊天的 MCP Apps 面板中直接检查并点击了交流按钮：已打开的旧组件没有同页选词，仍显示通用开场，点击后只显示“准备好了”，没有调用新版的显式开始流程。服务器代码更新和新资源读取，不能使已经挂载的旧 iframe 自动升级。新打开的组件已确认显示同页选词和“爱情”的英语开场；首次开始只把内容放入输入框，用户明确确认仍须手动发送。因此那次验证不算自动开始成功。

此前 v12 的被动上下文方案已被后续实现替代。每次服务或 UI 元数据修改后，需刷新插件连接并新开聊天以加载新资源。模拟宿主只能验证组件发出了协议请求，不能代替真实语音端到端验证。

2026-10-18 真实面板复核：用户确认重新打开后仍见旧文案。通过 MCP Apps UI 自动化直接读取，面板 12 为 v11，面板 13 为 v12；不能再将重新打开旧界面归因于用户未关闭原面板。在真实 v12 面板点击“重新准备本次话题”后，本聊天实际收到 `kind=model_context` 的 MCP App 上下文，包含已保存的爱情主题、指定开场、9 个目标词及交流规则。证明上下文交接已到达当前文本模型，不证明原生 Voice 已接续或已完成实际发言/复盘。截图：`previews/local-v12-context-confirmed.png`。再次调用本地测试 open_workspace 后，面板 14 实际显示 v12。

同时修复旧资源兼容表遗漏 v10、v11 的问题：现在保留从 v1 至当前版本前一版的全部 URI；协议测试独立遍历每个历史版本并确认都返回当前 HTML，避免测试只检查服务自己导出的不完整列表。宿主仍可能缓存旧 HTML；[官方连接测试流程](https://developers.openai.com/plugins/deploy/connect-chatgpt)要求在 UI 元数据变化后刷新连接并新开聊天。[UI 文档](https://developers.openai.com/plugins/build/chatgpt-ui)要求把 URI 作为缓存键。浏览器设置页自动操作连续超时，本次没有完成或声称已完成连接 Refresh。已有缓存界面不能由修复资源读取替代主动刷新。


### 2026-10-18：最终交流启动流程

点击“开始交流”后保存主题、开场白、模式与目标词，并通过 `ui/message` 自动发送一条完整准备消息。ChatGPT 在文字中只确认“好，我们开始吧。”；用户手动打开同一聊天的语音，第一次语音回应使用指定英文开场白。准备消息和确认回复不计入练习记录。流程不调用 `ui/update-model-context`，避免输入框出现重复的待提交上下文卡片。界面只能确认消息请求被宿主接受，不能据此证明模型已回复或 Voice 已连接；原生 Voice 的主题承接仍需端到端验收。
### 2026-10-19：v16 测试连接恢复

原 Quick Tunnel 进程停止后，原“Elis 本地测试”仍保留已失效的服务地址，实际调用返回 `-32603`。恢复本地服务时，通过 `VOCAB_LOCAL_RUNTIME_DIR` 继续使用原 `.runtime/elis-local`，保留测试词库和已有授权数据，同时从当前工作区提供 v16 代码。新 HTTPS 通道通过匿名访问限制、OAuth/PKCE、32 个 MCP 工具发现及 v16 资源读取检查。

现有应用设置页没有修改 URL 的入口，插件包仅绑定 App ID，因此保留旧连接，建立独立替代入口“**Elis 本地测试 v16**”（`asdk_app_6ad5c5e1ed48819196e69750b55274df`），完成真实 ChatGPT OAuth 授权。真实网页宿主调用 `open_workspace` 成功，实际 iframe 显示“词库已连接”“界面 v16”，恢复原 12 个测试词与 9 个已选词，词库操作栏显示“勾选即生效，直接开始”。仅执行只读打开和页面切换，未更改单词、熟练度或开始学习任务。截图：`previews/local-v16-connection-confirmed.png`。

这是临时本地通道，仍需电脑和通道进程保持运行。此记录验证网页宿主加载，不代表原生 Voice 或平板实机验收已完成。

### 2026-10-22：v17 平板窄框与展开入口修复

用户报告 v16 在平板只显示窄框、没有展开入口，电脑可用。代码复核发现三处缺口：展开按钮依赖宿主 `availableDisplayModes`；窄屏样式隐藏所有 quiet 顶栏按钮，低高度横屏还会隐藏整个顶栏；固定 `100dvh` 配合回报当前框高度可能让初始占位框保持折叠。

v17 在 App 初始化声明 inline/fullscreen 能力，保留显式展开入口，优先使用可检测的原生 `window.openai.requestDisplayMode`，再兼容标准 MCP 请求，并尊重宿主实际授予的模式。极矮 inline 框主动请求可阅读高度，通过标准 size-changed 和可用的 `notifyIntrinsicHeight` 回报；若宿主不调整高度，显示完整的紧凑词库预览卡片并允许 iframe 内滚动。真实短横屏在导航保留展开按钮。尺寸与主题订阅包含宿主上下文、原生 globals 和窗口变化。

`npm run test:mobile-viewport` 覆盖缺省能力、原生全屏、拒绝全屏、初始 160/180 像素框、受限卡片滚动选词、尺寸反馈稳定性及横竖屏切换；`test:polish` 验收 8 种尺寸、设置和弹层；业务 44 项、选词流程和 Workers 运行时验收通过。截图为本地协议宿主模拟，不是用户平板实机证据。用户需关闭旧卡片，在新聊天重新打开正式 Elis 并确认界面 v17；本次尚未取得修复后的平板实机截图。接口依据：[OpenAI 官方运行时参考](https://developers.openai.com/plugins/reference)。
