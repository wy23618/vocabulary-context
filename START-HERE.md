# Vocabulary Context：快速开始

本包用于在你自己的 Windows 电脑上运行个人词库。服务和数据库都留在你的电脑；每位使用者需要运行自己的服务。

## 安装

1. 安装 Node.js 24 或更新版本，以及 Cloudflare 的 `cloudflared` 程序。
2. 解压本包，在解压后的文件夹地址栏输入 `powershell` 并按回车。
3. 依次运行：

   ```powershell
   npm ci
   npm run build
   ./scripts/Start-SecureConnection.ps1
   ```

4. 首次启动会自动生成本机登录密码和空白词库。密码保存在项目目录的 `.env` 文件中，不要分享给他人。
5. 启动脚本会显示一个 HTTPS 地址。在 ChatGPT 的自定义 MCP 服务设置中，将地址填为 `https://该地址/mcp`，认证选择 OAuth。
6. 按 ChatGPT 页面提示授权。在密码页面使用 `.env` 里的 `VOCAB_OWNER_PASSWORD`。

## 日常使用

启动时运行 `./scripts/Start-SecureConnection.ps1`。电脑需要保持开机联网，服务和连接需要持续运行。Quick Tunnel 地址是临时的，停止或重建连接后地址可能改变；地址变化时要更新 ChatGPT 中的 MCP 服务地址并重新授权。

停止服务时运行 `./scripts/Stop-SecureConnection.ps1`。词库保存在项目目录的 `data` 文件夹；请把该文件夹单独备份，切勿发给其他人。

更多功能、备份与故障排查见 `README.md` 和 `docs/SELF-HOSTING.md`。如果组织策略阻止 PowerShell 脚本，不要修改安全策略绕过限制；请在允许运行这些脚本的电脑上操作。
