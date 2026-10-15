import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const endpoint=process.argv[2];
if(!endpoint)throw new Error('用法：node scripts/configure-endpoint.mjs https://实际服务地址');
const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('请提供不含凭据和路径的 HTTPS 服务源地址。');
const file=new URL('../mcp.json',import.meta.url);const manifest=JSON.parse(readFileSync(file,'utf8'));manifest.mcpServers['vocabulary-context'].url=`${url.origin}/mcp`;
writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');console.log(`插件连接地址已更新：${url.origin}/mcp。数据位置保持独立。`);
