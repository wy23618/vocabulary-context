import { readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync } from 'node:fs';
import { join,relative,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync,strToU8 } from 'fflate';
import { publishable } from './package-files.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const entries={};
function add(path){const full=join(root,path);entries[path.replaceAll('\\','/')]=new Uint8Array(readFileSync(full));}
function walk(path){for(const item of readdirSync(join(root,path),{withFileTypes:true})){const file=join(path,item.name);if(!publishable(file))continue;if(item.isDirectory())walk(file);else add(file);}}
for(const path of ['plugin.json','mcp.json','package.json','package-lock.json','README.md','.env.example','.dev.vars.example','wrangler.jsonc'])add(path);
const plugin=JSON.parse(readFileSync(join(root,'plugin.json'),'utf8'));
if(plugin.extensions?.['com.openai']?.apps==='./.app.json'){
  if(!existsSync(join(root,'.app.json')))throw new Error('Bind your actual ChatGPT connection before packaging this manifest.');
  add('.app.json');
}
for(const path of ['skills','server','shared','scripts','web','docs','deploy','cloudflare'])walk(path);
const manifest=JSON.parse(readFileSync(join(root,'mcp.json'),'utf8'));
if(manifest.mcpServers['vocabulary-context'].url.includes('.invalid'))console.warn('Package has an unconfigured endpoint: configure HTTPS before installing.');
mkdirSync(join(root,'dist'),{recursive:true});
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const out=join(root,'dist',`vocabulary-context-${version}.zip`);writeFileSync(out,zipSync(entries,{level:6}));
console.log(`Plugin package: ${out}`);
console.log('Private .env, user databases, logs, node_modules and test data are excluded.');
