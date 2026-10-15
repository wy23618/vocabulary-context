# 独立运行说明

每份安装只使用它自己的登录设置和 `data` 目录。将项目包分别交给不同使用者，每个人在自己的电脑运行，即可保持词库独立。不要把自己的 `.env`、`data` 或数据库备份放入分发包。

## 环境要求

- Windows 10/11
- Node.js 24 或更新版本
- Cloudflare `cloudflared`
- 可使用 ChatGPT 自定义 MCP 服务的账号

## 首次启动

在项目目录打开 PowerShell，运行：

```powershell
npm ci
npm run build
./scripts/Start-SecureConnection.ps1
```

启动脚本自动创建本机 `.env`、随机词库密码和 `data` 文件夹，然后创建临时 HTTPS 转发地址。将脚本输出的 HTTPS 地址加上 `/mcp`，作为 ChatGPT 自定义 MCP 服务 URL，认证选择 OAuth。授权时输入 `.env` 中 `VOCAB_OWNER_PASSWORD` 的值。不要把该密码发给其他人。

## 使用与数据

电脑、服务和转发连接须保持运行。Quick Tunnel 是临时测试连接，不保证长期在线；重启后地址可能变化，需更新 ChatGPT 连接并重新授权。停止命令：

```powershell
./scripts/Stop-SecureConnection.ps1
```

数据库位于项目目录的 `data` 文件夹。备份和恢复方法见项目 `README.md` 的“数据、备份与迁移”章节。重新解压新版程序时，应保留原来的 `data` 文件夹和 `.env`，再把它们放回新版项目目录。

如果组织策略阻止 PowerShell 脚本，不要修改安全策略绕过限制；请在允许运行这些脚本的电脑上操作。

## 连接边界

本项目当前主要面向 ChatGPT 插件 / MCP App。其他 MCP 客户端及 ChatGPT 独立桌面、平板应用尚未全部单独验收。临时连接由 Cloudflare Tunnel 转发，请只在了解这一限制后用于试用。每位使用者单独运行一份实例；该版本没有多账号词库隔离。
