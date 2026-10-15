import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const destination=join(root,'.env');
if(!existsSync(destination)) {
  writeFileSync(destination,`# Local private configuration. Never commit or share.\nPORT=8787\nHOST=127.0.0.1\nVOCAB_DATA_DIR=./data\nVOCAB_PUBLIC_URL=http://127.0.0.1:8787\nVOCAB_OWNER_PASSWORD=${randomBytes(32).toString('base64url')}\nVOCAB_REDIRECT_URIS=https://chatgpt.com/connector_platform_oauth_redirect\n`,{mode:0o600,flag:'wx'});
  console.log('已创建本机私有配置。登录密码保存在 .env，不写入运行日志。');
} else console.log('已有本机配置，保持原样。');
console.log('模型路径：仅当前宿主订阅，无模型 API。');
