import { existsSync, readFileSync, mkdirSync, copyFileSync, renameSync, unlinkSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.mjs';
import { withStoppedRepository } from '../server/repository.mjs';
import { checkDatabase, fileHash, parseFlags } from './backup.mjs';

/** Restore the portable learning database only. Existing auth credentials remain device-local. */
export function restoreBackup({dataDir=loadConfig().dataDir,backupDir,replace=false}={}) {
  if(!backupDir)throw new Error('请通过--from提供备份目录。');dataDir=resolve(dataDir);backupDir=resolve(backupDir);
  const manifest=JSON.parse(readFileSync(join(backupDir,'manifest.json'),'utf8'));
  if(manifest.format!=='vocabulary-context-backup'||manifest.format_version!==1)throw new Error('不是受支持的Vocabulary Context备份。');
  if(manifest.schema_version!==1)throw new Error('备份结构版本不受支持；较新备份需要升级插件。');
  const source=join(backupDir,'vocabulary.sqlite');if(fileHash(source)!==manifest.sha256)throw new Error('备份校验值不一致，文件可能不完整或已修改。');const checked=checkDatabase(source);if(checked.schema!==manifest.schema_version)throw new Error('备份清单与词库结构不一致。');
  return withStoppedRepository(dataDir,()=>{
    const target=join(dataDir,'vocabulary.sqlite');if(existsSync(target)&&!replace)throw new Error('目标词库已存在；恢复会替换它。确认需要替换时加入--replace。');
    if(resolve(source)===resolve(target))throw new Error('备份不能与恢复目标是同一个文件。');
    const temporary=join(dataDir,`.vocabulary-restore-${randomUUID()}.sqlite`);copyFileSync(source,temporary);const fd=openSync(temporary,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
    let previousDir=null;const moved=[];
    try{
      if(existsSync(target)){previousDir=join(dataDir,`before-restore-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);mkdirSync(previousDir);for(const suffix of ['','-wal','-shm']){const path=target+suffix;if(existsSync(path)){const backup=join(previousDir,'vocabulary.sqlite'+suffix);renameSync(path,backup);moved.push({path,backup});}}}
      else for(const suffix of ['-wal','-shm'])if(existsSync(target+suffix))throw new Error('目标存在残留SQLite日志，请先核对原词库，恢复已取消。');
      renameSync(temporary,target);return {dataDir,restored:true,previousDir,schema_version:checked.schema,counts:checked.counts,authorization:'not_imported'};
    }catch(error){if(existsSync(temporary))unlinkSync(temporary);for(const item of moved.reverse())renameSync(item.backup,item.path);throw error;}
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try{const flags=parseFlags(process.argv.slice(2));const result=restoreBackup({dataDir:flags['--data-dir'],backupDir:flags['--from'],replace:flags.replace});console.log(`词库已恢复：${result.dataDir}${result.previousDir?`\n恢复前词库保留在：${result.previousDir}`:''}\nOAuth授权未导入；迁移到新电脑后请重新授权。`);}catch(error){console.error(error.message);process.exitCode=1;}
}
