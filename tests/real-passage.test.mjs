import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { tools, draftSchema } from '../server/schemas.mjs';
import { buildReviewDraft } from './fixtures/review-draft.mjs';
import { articleText } from './fixtures/review-passage.mjs';

async function throughSchema(service,name,args={}) {
  const definition=tools.find(t=>t.name===name);assert.ok(definition,`Registered tool ${name}`);
  const input=definition.inputSchema.parse(args);const result=await service.execute(name,input);definition.outputSchema.parse(result);return result;
}
const req=()=>randomUUID();
test('authored 255-word reading and real Chinese glosses pass public schemas, coverage, shared updates and reopen',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'vocab-real-passage-')),services=[];
  const open=()=>{const service=createService({dataDir,now:()=>new Date('2026-10-14T04:00:00Z')});services.push(service);return service;};
  t.after(()=>{for(const s of services)s.close();rmSync(dataDir,{recursive:true,force:true});});
  const computer=open(),peer=open();
  const preview=await throughSchema(computer,'add_words',{text:'compelling\nretain\ndiminish\nimpose\nconventional',source:'PASTE',request_id:req()});
  await throughSchema(computer,'confirm_import',{import_id:preview.import_id,items:preview.items.map(({id,word,user_note,level,included})=>({id,word,user_note,level,included})),request_id:req()});
  assert.equal((await throughSchema(peer,'list_words',{time:'today'})).words.length,5);
  const {selection}=await throughSchema(computer,'select_target_words',{mode:'auto',auto_count:0,request_id:req()});
  const {generation}=await throughSchema(computer,'prepare_article',{selection_id:selection.id,config:{topic:'AI与大学学习',length:'short',difficulty:'standard',syntax:'standard'},request_id:req()});
  const draft=draftSchema.parse(await buildReviewDraft(computer));assert.equal(draft.article,articleText);assert.ok(draft.word_map.length>100);assert.ok(draft.word_map.every(m=>/[\u3400-\u9fff]/.test(m.meaning)&&/[\u3400-\u9fff]/.test(m.contextual_meaning)));
  const tokenized=await throughSchema(computer,'tokenize_article',{article:draft.article});assert.equal(tokenized.word_count,255);for(const token of tokenized.tokens.filter(t=>t.requires_mapping))assert.ok(draft.word_map.some(m=>m.token_index===token.index),`gloss for ${token.surface_form}`);
  const validation=await throughSchema(computer,'validate_article',{generation_id:generation.id,draft});assert.equal(validation.valid,true,JSON.stringify(validation.errors));
  const {article}=await throughSchema(computer,'save_article',{generation_id:generation.id,draft,request_id:req()});assert.equal(article.syntax_features.length,4);assert.deepEqual(article.coverage.map(c=>[c.word,c.count]).sort(),[['compelling',2],['conventional',2],['diminish',2],['impose',1],['retain',2]]);
  const peerArticle=(await throughSchema(peer,'get_article',{lesson_id:article.lesson_id})).article;assert.deepEqual(peerArticle,article);
  for(const occurrence of article.word_map)assert.equal(article.article.slice(occurrence.start,occurrence.end),occurrence.surface_form);
  const retains=peerArticle.word_map.filter(m=>m.target&&m.lemma==='retain');assert.equal(retains.length,2);assert.notEqual(retains[0].occurrence_id,retains[1].occurrence_id);assert.match(retains[0].contextual_meaning,/责任/);assert.match(retains[1].contextual_meaning,/讨论/);
  const before=(await throughSchema(peer,'list_words',{})).words.find(w=>w.word==='retain');
  await throughSchema(peer,'get_article',{lesson_id:article.lesson_id});assert.equal((await throughSchema(computer,'list_words',{})).words.find(w=>w.word==='retain').version,before.version);
  const feedback=await throughSchema(peer,'record_word_feedback',{lesson_id:article.lesson_id,occurrence_id:retains[0].occurrence_id,feedback:'known',expected_version:before.version,request_id:req()});assert.equal(feedback.word.familiarity_level,3);
  assert.equal((await throughSchema(computer,'get_selection',{})).selection.words.find(w=>w.word==='retain').familiarity_level,3);
  await throughSchema(peer,'save_preferences',{preferences:{lesson_id:article.lesson_id,reading_scroll:418},request_id:req()});
  computer.close();peer.close();const reopened=open();assert.deepEqual((await throughSchema(reopened,'get_article',{lesson_id:article.lesson_id})).article,article);assert.equal((await throughSchema(reopened,'get_preferences',{})).preferences.reading_scroll,418);assert.equal((await throughSchema(reopened,'list_words',{})).words.find(w=>w.word==='retain').familiarity_level,3);
  assert.equal((await throughSchema(reopened,'get_generation',{generation_id:generation.id})).status,'saved');
});
test('review draft builder has no production fallback, deterministic token-index definitions and explicit per-position senses',async()=>{
  const draft=await buildReviewDraft();draftSchema.parse(draft);assert.equal(draft.article,articleText);const compelling=draft.word_map.filter(m=>m.lemma==='compelling');assert.match(compelling[0].contextual_meaning,/问题/);assert.match(compelling[1].contextual_meaning,/方法/);assert.ok(draft.word_map.every(m=>!m.meaning.includes('测试')&&!m.contextual_meaning.includes('测试')));
});
