import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.mjs';

export const fileHash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
export function checkDatabase(path) {
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    const integrity=db.prepare('PRAGMA integrity_check').all();
    if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw new Error('备份词库完整性检查未通过。');
    const schema=db.prepare('PRAGMA user_version').get().user_version;
    if(schema!==1)throw new Error(schema>1?'备份来自更新版本，请先升级插件。':'备份结构版本不受支持。');
    const counts={};for(const table of ['words','events','objects','requests'])counts[table]=db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    return {schema,counts};
  }finally{db.close();}
}
/** Online SQLite snapshot. OAuth/auth.sqlite intentionally stays outside the portable backup. */
export function createBackup({dataDir=loadConfig().dataDir,outputDir}={}) {
  dataDir=resolve(dataDir);const source=join(dataDir,'vocabulary.sqlite');if(!existsSync(source))throw new Error('没有可备份的词库。');
  const tag=new Date().toISOString().replace(/[:.]/g,'-');outputDir=resolve(outputDir??join(dataDir,'backups',`${tag}-${randomUUID().slice(0,8)}`));
  if(existsSync(outputDir))throw new Error('备份目录已经存在，请使用新的目录避免覆盖。');mkdirSync(dirname(outputDir),{recursive:true});mkdirSync(outputDir);
  const destination=join(outputDir,'vocabulary.sqlite'),db=new DatabaseSync(source,{readOnly:true});
  try{db.prepare('PRAGMA busy_timeout=10000').run();db.prepare('VACUUM INTO ?').run(destination);}finally{db.close();}
  const checked=checkDatabase(destination);const manifest={format:'vocabulary-context-backup',format_version:1,schema_version:checked.schema,created_at:new Date().toISOString(),sha256:fileHash(destination),counts:checked.counts,files:['vocabulary.sqlite'],excluded:['auth.sqlite','OAuth tokens','configuration secrets']};
  writeFileSync(join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return {backupDir:outputDir,manifest};
}
export function parseFlags(argv) {
  const result={};for(let i=0;i<argv.length;i++){const name=argv[i];if(name==='--replace')result.replace=true;else if(['--data-dir','--out','--from'].includes(name)){if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error(`缺少${name}的路径。`);result[name]=argv[++i];}else throw new Error(`未知选项：${name}`);}return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try{const flags=parseFlags(process.argv.slice(2));const result=createBackup({dataDir:flags['--data-dir'],outputDir:flags['--out']});console.log(`词库备份：${result.backupDir}\n授权凭据没有导出。`);}catch(error){console.error(error.message);process.exitCode=1;}
}
