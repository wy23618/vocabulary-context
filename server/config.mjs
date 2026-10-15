import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url || 'file:///bundle/server/config.mjs'));

export function loadConfig(env=process.env) {
  const port=Number(env.PORT||8787);
  const publicUrl=(env.VOCAB_PUBLIC_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
  const url=new URL(publicUrl);
  if (url.protocol!=='https:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new Error('远程服务必须使用 HTTPS。');
  return {port,host:env.HOST||'127.0.0.1',publicUrl,
    dataDir:resolve(projectRoot,env.VOCAB_DATA_DIR||'data'),
    ownerPassword:env.VOCAB_OWNER_PASSWORD||'',
    redirectUris:(env.VOCAB_REDIRECT_URIS||'https://chatgpt.com/connector_platform_oauth_redirect').split(',').map(x=>x.trim()).filter(Boolean),
  };
}
