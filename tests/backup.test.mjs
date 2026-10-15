import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createService } from '../server/service.mjs';
import { createBackup, fileHash } from '../scripts/backup.mjs';
import { restoreBackup } from '../scripts/restore.mjs';
const call=(s,name,args={})=>s.execute(name,{...args,request_id:randomUUID()});
function workspace(t) {const dir=mkdtempSync(join(tmpdir(),'vocab-backup-'));const services=[];t.after(()=>{for(const s of services)s.close();rmSync(dir,{recursive:true,force:true});});return {dir,services,open(dataDir=join(dir,'data')){const s=createService({dataDir});services.push(s);return s;}};}
async function populate(s) {
  const batch=await call(s,'add_words',{text:'retain compelling'});await call(s,'confirm_import',{import_id:batch.import_id,items:batch.items});const {selection}=await call(s,'select_target_words',{auto_count:0});const {generation}=await call(s,'prepare_article',{selection_id:selection.id,config:{length:'custom',min_words:100,max_words:200,topic:'测试迁移'}});
  // Coverage/restore fixture only; no production generation fallback.
  const article=Array.from({length:15},()=> 'Readers retain knowledge when compelling evidence supports thoughtful discussion.').join(' ');const {tokens}=await s.execute('tokenize_article',{article});const draft={title:'Restore fixture',topic:'测试迁移',article,word_map:tokens.map(t=>({token_index:t.index,lemma:t.surface_form.toLowerCase(),part_of_speech:'noun',meaning:'测试释义',contextual_meaning:`位置${t.index}`,target:false})),syntax_features:[],quality_checks:{naturalness_notes:'Restore fixture only',argument_notes:'Restore fixture only'}};const saved=await call(s,'save_article',{generation_id:generation.id,draft});return {words:(await s.execute('list_words')).words,article:saved.article,generation,selection};
}
test('online consistent backup includes learning records and excludes authentication credentials',async t=>{
  const f=workspace(t),dataDir=join(f.dir,'data'),s=f.open(dataDir);const initial=await populate(s);writeFileSync(join(dataDir,'auth.sqlite'),'secret token fixture');const result=createBackup({dataDir,outputDir:join(f.dir,'snapshot')});assert.equal(result.manifest.schema_version,1);assert.ok(result.manifest.counts.events>=4);assert.equal(existsSync(join(result.backupDir,'auth.sqlite')),false);
  const target=join(f.dir,'migrated');restoreBackup({dataDir:target,backupDir:result.backupDir});const restored=f.open(target);assert.deepEqual((await restored.execute('list_words')).words,initial.words);assert.deepEqual((await restored.execute('get_article',{lesson_id:initial.article.lesson_id})).article,initial.article);assert.deepEqual((await restored.execute('get_generation',{generation_id:initial.generation.id})).generation.words,initial.generation.words);assert.deepEqual(restored.repository.events(initial.words[0].id),s.repository.events(initial.words[0].id));assert.equal(existsSync(join(target,'auth.sqlite')),false);
});
test('restore requires stopped service, rejects implicit overwrite, preserves before-restore database and auth',async t=>{
  const f=workspace(t),dataDir=join(f.dir,'data'),s=f.open(dataDir);await populate(s);const {backupDir}=createBackup({dataDir,outputDir:join(f.dir,'snapshot')});assert.throws(()=>restoreBackup({dataDir,backupDir,replace:true}),/仍在运行/);s.close();assert.throws(()=>restoreBackup({dataDir,backupDir}),/--replace/);writeFileSync(join(dataDir,'auth.sqlite'),'device-specific authorization');const result=restoreBackup({dataDir,backupDir,replace:true});assert.ok(existsSync(join(result.previousDir,'vocabulary.sqlite')));assert.equal(readFileSync(join(dataDir,'auth.sqlite'),'utf8'),'device-specific authorization');assert.equal((await f.open(dataDir).execute('list_words')).words.length,2);
});
test('hash mismatch and newer schema backups are rejected before target is touched',async t=>{
  const f=workspace(t),dataDir=join(f.dir,'data'),s=f.open(dataDir);await populate(s);const {backupDir}=createBackup({dataDir,outputDir:join(f.dir,'snapshot')});const manifestPath=join(backupDir,'manifest.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));writeFileSync(manifestPath,JSON.stringify({...manifest,sha256:'invalid'}));const target=join(f.dir,'target');assert.throws(()=>restoreBackup({dataDir:target,backupDir}),/校验值/);assert.equal(existsSync(join(target,'vocabulary.sqlite')),false);
  const db=new DatabaseSync(join(backupDir,'vocabulary.sqlite'));db.exec('PRAGMA user_version=2');db.close();writeFileSync(manifestPath,JSON.stringify({...manifest,sha256:fileHash(join(backupDir,'vocabulary.sqlite'))}));assert.throws(()=>restoreBackup({dataDir:target,backupDir}),/更新版本/);assert.equal(existsSync(join(target,'vocabulary.sqlite')),false);
});
test('independent repository instances share writes while live leases only guard restoration',async t=>{
  const f=workspace(t),dataDir=join(f.dir,'data'),one=f.open(dataDir),two=f.open(dataDir);const batch=await call(one,'add_words',{text:'retain'});const {words}=await call(one,'confirm_import',{import_id:batch.import_id,items:batch.items});assert.equal((await two.execute('list_words')).words[0].id,words[0].id);const updated=await call(two,'update_familiarity',{word_id:words[0].id,expected_version:words[0].version,level:3});assert.equal((await one.execute('list_words')).words[0].version,updated.word.version);await assert.rejects(call(one,'update_familiarity',{word_id:words[0].id,expected_version:words[0].version,level:0}),{code:'VERSION_CONFLICT'});
});
