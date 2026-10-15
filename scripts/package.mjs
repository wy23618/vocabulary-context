import { readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync } from 'node:fs';
import { join,relative,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync,strToU8 } from 'fflate';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const entries={};
function add(path){const full=join(root,path);entries[path.replaceAll('\\','/')]=new Uint8Array(readFileSync(full));}
function walk(path){for(const item of readdirSync(join(root,path),{withFileTypes:true})){const file=join(path,item.name);if(file.replaceAll('\\','/')==='docs/previews')continue;if(item.isDirectory())walk(file);else add(file);}}
for(const path of ['plugin.json','mcp.json','package.json','package-lock.json','README.md','.env.example'])add(path);
if(existsSync(join(root,'.app.json')))add('.app.json');
for(const path of ['skills','server','shared','scripts','web','docs','deploy'])walk(path);
const manifest=JSON.parse(readFileSync(join(root,'mcp.json'),'utf8'));
if(manifest.mcpServers['vocabulary-context'].url.includes('.invalid'))console.warn('Package has an unconfigured endpoint: configure HTTPS before installing.');
mkdirSync(join(root,'dist'),{recursive:true});
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const out=join(root,'dist',`vocabulary-context-${version}.zip`);writeFileSync(out,zipSync(entries,{level:6}));
console.log(`Plugin package: ${out}`);
console.log('Private .env, user databases, logs, node_modules and test data are excluded.');
