# 持续在线服务迁移（第二阶段，当前不部署）

保持一个服务、一个 SQLite 数据目录，无需多数据库或同步总线。

1. 在电脑运行 `backup.mjs --out <新备份目录>`，取得一致性业务备份。保留 `manifest.json` 与 `vocabulary.sqlite`，不要只导出单词文本。
2. 验证备份校验和，复制备份及当前代码到后续服务器。备份不含 OAuth token 或 `.env`；保管备份文件，它含学习历史。
3. Node 24 环境中安装依赖并构建 UI，或采用预备的 `deploy/Dockerfile`。配置固定 HTTPS 服务地址、永久数据卷、个人词库密码和准确 callback。
4. 在目标服务停止时执行 `restore.mjs --from <备份> --data-dir <永久目录>`，检查数据版本与 SQLite 完整性。保留所有词条 ID、事件、请求去重、generation、文章和位置释义。
5. 启动同一服务。在 MCP 客户端验证 OAuth、词库、历史文章、反馈、重试去重与重新打开；ChatGPT 两端更新同一连接并重新授权。OAuth 凭据不随业务备份迁移。
6. 完成两端对照验收后停止电脑服务，避免两个独立可写词库并行。保留旧备份，出现问题可停新服务恢复旧连接；迁移期间新写入需另行合并，不能静默覆盖。

数据库当前 schema version 1，`migrations` 表及 `PRAGMA user_version` 标记版本。恢复拒绝比当前程序更新的数据版本。未来改 schema 时新增显式事务迁移，备份后升级；不要自动把较新库降级。

`VACUUM INTO` 是 SQLite 一致性快照，配合哈希与 `integrity_check`；不要在运行中只复制主 `.sqlite` 文件而忽略 WAL。脚本会阻止对正在使用的目标数据库恢复，`--replace` 将旧数据库/WAL/SHM保留在独立目录。

后续托管、域名或隧道如有费用须提前说明，由用户明确同意后开通。本次没有执行这阶段。
