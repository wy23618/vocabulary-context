import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';

function setup(t) {
  const dataDir=mkdtempSync(join(tmpdir(),'vocab-business-'));let time='2026-10-14T04:00:00Z';let service=createService({dataDir,now:()=>new Date(time),random:()=>.37});
  t.after(()=>{service.close();rmSync(dataDir,{recursive:true,force:true});});
  return {get s(){return service;},time:v=>time=v,dataDir,restart(){service.close();service=createService({dataDir,now:()=>new Date(time),random:()=>.37});return service;}};
}
const call=(s,name,args={})=>s.execute(name,{...args,request_id:args.request_id??randomUUID()});
async function add(s,text,level=1) { const batch=await call(s,'add_words',{text});return call(s,'confirm_import',{import_id:batch.import_id,items:batch.items.map(x=>({...x,level:typeof level==='number'?level:x.level}))}); }
async function selection(s,args={}) {return (await call(s,'select_target_words',args)).selection;}
const reading=`Compelling evidence suggests that students retain information more effectively when they explain it to someone else. Yet universities often impose conventional assessment methods that reward short term performance rather than durable understanding. A student who can reproduce a definition may still struggle to identify the assumptions behind an argument, particularly when familiar ideas appear in an unfamiliar setting.

Digital assistants could help address this gap, provided that their role is carefully defined. Instead of supplying a finished answer, a system might invite learners to compare competing explanations or to defend a conclusion against a plausible objection. Such encounters require active judgment, which is precisely what passive review can gradually diminish. The educational value comes from the intellectual work that remains with the learner, rather than from the speed of the software.

This distinction has practical consequences. Teachers need to design tasks in which useful assistance supports independent reasoning, while students need opportunities to recognize when an apparently compelling response rests on weak evidence. Institutions should also retain spaces for discussion without automated guidance. If technology becomes a substitute for every difficult moment, it may diminish confidence in the very abilities that education is intended to develop. A balanced approach therefore treats convenience as one consideration among several, placing lasting understanding above the promise of effortless progress.`;
async function draftFor(s,article=reading) {
  const {tokens}=await s.execute('tokenize_article',{article});
  // Deliberately labelled test fixture definitions; never available in runtime generation.
  return {title:'Assistance and independent judgment',topic:'教育',article,word_map:tokens.map(t=>({token_index:t.index,lemma:t.surface_form.toLowerCase()==='retained'?'retain':t.surface_form.toLowerCase(),part_of_speech:t.surface_form.toLowerCase()==='retained'?'verb':'fixture',meaning:`测试释义：${t.surface_form}`,contextual_meaning:`测试语境：${t.index}`,collocation:''})),syntax_features:[],quality_checks:{naturalness_notes:'Test fixture, not a model evaluation.',argument_notes:'Test fixture for coverage and persistence.'}};
}
async function prepared(s,words='compelling retain diminish impose conventional') {await add(s,words);const sel=await selection(s,{auto_count:0});const {generation}=await call(s,'prepare_article',{selection_id:sel.id,config:{topic:'教育',length:'short'}});return generation;}

test('staged import normalizes separators, apostrophes and hyphens; persistence requires confirmation',async t=>{
  const {s}=setup(t);const batch=await call(s,'add_words',{text:" Retain,retain\nwell-being;learner’s\ncompelling 有说服力的"});assert.equal(batch.items.length,4);assert.equal(batch.duplicate_count,1);assert.equal((await s.execute('list_words')).words.length,0);assert.equal(batch.items.at(-1).user_note,'有说服力的');
  const result=await call(s,'confirm_import',{import_id:batch.import_id,items:batch.items});assert.equal(result.saved_count,4);assert.ok(result.words.some(w=>w.word==='well-being'));assert.ok(result.words.some(w=>w.word==="learner's"));
});
test('readd follows all five levels; batch and technical duplicates never penalize twice',async t=>{
  const {s}=setup(t);for(let level=0;level<=4;level++){await add(s,`word${String.fromCharCode(97+level)}`,level);}
  const request_id=randomUUID(),args={text:'worda wordb wordc wordd worde worde',request_id};const batch=await s.execute('add_words',args);assert.equal(batch.duplicate_count,1);assert.deepEqual(batch.items.map(x=>x.level),[0,1,1,2,3]);assert.deepEqual(await s.execute('add_words',args),batch);
  const confirm={import_id:batch.import_id,items:batch.items,request_id:randomUUID()};const first=await s.execute('confirm_import',confirm);const retry=await s.execute('confirm_import',confirm);assert.deepEqual(first,retry);assert.ok(first.words.every(w=>w.add_count===2));
  await assert.rejects(call(s,'confirm_import',{import_id:batch.import_id,items:batch.items}),{code:'IMPORT_ALREADY_CONFIRMED'});await assert.rejects(s.execute('add_words',{...args,text:'other'}),{code:'REQUEST_CONFLICT'});
});
test('undo readd restores prior event state and refuses to overwrite later edits',async t=>{
  const {s}=setup(t);let {words}=await add(s,'retain',4);let batch=await call(s,'add_words',{text:'retain'});let result=await call(s,'confirm_import',{import_id:batch.import_id,items:batch.items});assert.equal(result.words[0].familiarity_level,3);
  const restored=await call(s,'undo_event',{event_id:result.undo_event_ids[0]});assert.equal(restored.word.familiarity_level,4);assert.equal(restored.word.add_count,1);
  batch=await call(s,'add_words',{text:'retain'});result=await call(s,'confirm_import',{import_id:batch.import_id,items:batch.items});await call(s,'update_familiarity',{word_id:words[0].id,level:2,expected_version:result.words[0].version});await assert.rejects(call(s,'undo_event',{event_id:result.undo_event_ids[0]}),{code:'UNDO_CONFLICT'});
});
test('version check prevents stale preview and cross-session lost updates',async t=>{
  const f=setup(t);const initial=(await add(f.s,'retain',3)).words[0];const batch=await call(f.s,'add_words',{text:'retain'});const second=createService({dataDir:f.dataDir});try{await call(second,'update_familiarity',{word_id:initial.id,level:4,expected_version:initial.version});await assert.rejects(call(f.s,'confirm_import',{import_id:batch.import_id,items:batch.items}),{code:'VERSION_CONFLICT'});await assert.rejects(call(f.s,'update_familiarity',{word_id:initial.id,level:0,expected_version:initial.version}),{code:'VERSION_CONFLICT'});}finally{second.close();}
});
test('soft removal can be undone and prevents unknown IDs',async t=>{
  const {s}=setup(t);const word=(await add(s,'retain')).words[0];const removed=await call(s,'remove_word',{word_id:word.id,expected_version:word.version});assert.equal((await s.execute('list_words')).words.length,0);await call(s,'undo_event',{event_id:removed.undo_event_ids[0]});assert.equal((await s.execute('list_words')).words.length,1);await assert.rejects(call(s,'remove_word',{word_id:'missing',expected_version:1}),{code:'WORD_NOT_FOUND'});
});
test('timezone, cross-midnight and inclusive seven day filtering use last ADD/READD',async t=>{
  const f=setup(t);f.time('2026-10-06T16:00:00Z');await add(f.s,'ancient',3);f.time('2026-10-07T16:00:00Z');await add(f.s,'boundary',0);f.time('2026-10-13T15:59:59Z');await add(f.s,'yesterday',1);f.time('2026-10-13T16:00:00Z');await add(f.s,'today',2);
  assert.deepEqual((await f.s.execute('list_words',{time:'today'})).words.map(w=>w.word),['today']);assert.deepEqual((await f.s.execute('list_words',{time:'yesterday'})).words.map(w=>w.word),['yesterday']);assert.equal((await f.s.execute('list_words',{time:'7days'})).words.length,3);assert.deepEqual((await f.s.execute('list_words',{time:'earlier',levels:[3,4]})).words.map(w=>w.word),['ancient']);
  await add(f.s,'ancient',null);assert.equal((await f.s.execute('list_words',{time:'today'})).words.length,2);assert.equal((await f.s.execute('list_words',{time:'today'})).time_range.timezone,'Asia/Shanghai');
});
test('forgotten filter includes repeated readds and previously familiar readds',async t=>{const {s}=setup(t);await add(s,'retain',4);await add(s,'retain',null);await add(s,'diminish',1);await add(s,'diminish',null);await add(s,'diminish',null);assert.equal((await s.execute('list_words',{forgotten:true})).words.length,2);});
test('selection preserves today/manual dedupes sources and excludes paused old words',async t=>{
  const f=setup(t);f.time('2026-10-01T00:00:00Z');const old=(await add(f.s,'ancient retained conventional evidence knowledge',2)).words;const paused=await call(f.s,'update_familiarity',{word_id:old[0].id,paused:true,expected_version:old[0].version});f.time('2026-10-14T04:00:00Z');const today=(await add(f.s,'compelling diminish')).words;
  let sel=await selection(f.s,{mode:'mixed',manual_ids:[today[0].id,old[1].id],auto_count:2});assert.equal(sel.words.length,5);assert.deepEqual(sel.words.find(w=>w.id===today[0].id).sources,['today','manual']);assert.ok(!sel.words.some(w=>w.id===paused.word.id));const locked=sel.words.filter(w=>!w.sources.includes('auto')).map(w=>w.id);
  const rerolled=(await call(f.s,'reroll_auto_words',{selection_id:sel.id})).selection;assert.deepEqual(rerolled.words.filter(w=>!w.sources.includes('auto')).map(w=>w.id),locked);assert.ok(rerolled.words.filter(w=>w.sources.includes('auto')).some(w=>!sel.words.some(x=>x.id===w.id)));
  sel=(await call(f.s,'save_selection',{selection_id:sel.id,remove_ids:[today[1].id],add_ids:[old[0].id]})).selection;assert.ok(!sel.words.some(w=>w.id===today[1].id));assert.ok(sel.words.some(w=>w.id===old[0].id&&w.sources.includes('manual')));const again=(await call(f.s,'reroll_auto_words',{selection_id:sel.id})).selection;assert.ok(!again.words.some(w=>w.id===today[1].id));
});
test('manual mode is independent of today and empty old pool returns honest warning',async t=>{const {s}=setup(t);const word=(await add(s,'retain')).words[0];assert.equal((await selection(s,{mode:'manual',manual_ids:[]})).words.length,0);const result=await call(s,'select_target_words',{auto_count:4});assert.equal(result.selection.words.length,1);assert.ok(result.warning);const only=await selection(s,{mode:'manual',manual_ids:[word.id]});assert.deepEqual(only.words[0].sources,['manual']);});
test('high load suggests larger passage or splitting without dropping locked words',async t=>{
  const {s}=setup(t);await add(s,'abandon ability absolute absorb abstract abundant academic accelerate access accommodate accompany accomplish accurate achieve acknowledge acquire adapt adequate',0);const sel=await selection(s,{auto_count:0});const load=await s.execute('assess_load',{selection_id:sel.id,config:{length:'short'}});assert.equal(load.high,true);assert.equal(new Set(load.groups.flat()).size,18);await assert.rejects(call(s,'prepare_article',{selection_id:sel.id,config:{length:'short'}}),{code:'HIGH_LOAD'});assert.equal((await s.execute('get_selection')).selection.words.length,18);
});
test('generation has frozen configuration; host-only prepare does not create article or usage',async t=>{
  const {s}=setup(t);const generation=await prepared(s);assert.equal(generation.words.length,5);assert.match(generation.instructions,/subscription/);assert.equal((await s.execute('list_articles')).articles.length,0);assert.ok((await s.execute('list_words')).words.every(w=>w.article_count===0));await call(s,'save_selection',{selection_id:generation.selection_id,remove_ids:generation.words.map(w=>w.id)});assert.equal((await s.execute('get_generation',{generation_id:generation.id})).generation.words.length,5);
});
test('workspace restores authoritative pending generation and distinguishes its saved state',async t=>{
  const {s}=setup(t);const generation=await prepared(s,'retain');
  await call(s,'save_preferences',{preferences:{generation:{id:generation.id,config:{topic:'stale UI text'}}}});
  const preparedWorkspace=await s.execute('open_workspace');
  assert.equal(preparedWorkspace.active_generation.status,'prepared');assert.deepEqual(preparedWorkspace.active_generation.generation,generation);
  const {article}=await call(s,'save_article',{generation_id:generation.id,draft:await draftFor(s)});
  const savedWorkspace=await s.execute('open_workspace');assert.equal(savedWorkspace.active_generation.status,'saved');assert.equal(savedWorkspace.active_generation.article.lesson_id,article.lesson_id);
  await call(s,'save_preferences',{preferences:{generation:{id:'missing'}}});assert.equal((await s.execute('open_workspace')).active_generation,null);
});
test('host draft validates exact occurrence mappings, saves atomically and replay never recounts',async t=>{
  const {s}=setup(t);const generation=await prepared(s);const draft=await draftFor(s);const validation=await s.execute('validate_article',{generation_id:generation.id,draft});assert.equal(validation.valid,true);assert.equal((await s.execute('list_articles')).articles.length,0);
  const saved=await call(s,'save_article',{generation_id:generation.id,draft});assert.equal(saved.article.coverage.find(x=>x.word==='retain').count,2);assert.equal(saved.article.coverage.find(x=>x.word==='diminish').count,2);for(const map of saved.article.word_map)assert.equal(saved.article.article.slice(map.start,map.end),map.surface_form);
  const again=await call(s,'save_article',{generation_id:generation.id,draft});assert.equal(again.article.lesson_id,saved.article.lesson_id);assert.ok((await s.execute('list_words')).words.every(w=>w.article_count===1));const status=await s.execute('get_generation',{generation_id:generation.id});assert.equal(status.status,'saved');assert.equal(status.article.lesson_id,saved.article.lesson_id);
});
test('missing target, missing content map and incorrect spans fail without saved data',async t=>{
  const {s}=setup(t);const generation=await prepared(s);const draft=await draftFor(s);const incomplete={...draft,word_map:draft.word_map.slice(1)};const result=await s.execute('validate_article',{generation_id:generation.id,draft:incomplete});assert.equal(result.valid,false);assert.equal(result.errors[0].code,'ARTICLE_MAPPING');await assert.rejects(call(s,'save_article',{generation_id:generation.id,draft:incomplete}),{code:'ARTICLE_MAPPING'});assert.equal((await s.execute('list_articles')).articles.length,0);
  const bad={...draft,word_map:draft.word_map.map((m,i)=>i===0?{...m,token_index:10000}:m)};assert.equal((await s.execute('validate_article',{generation_id:generation.id,draft:bad})).valid,false);
  const absent=await draftFor(s,reading.replaceAll(/retain/gi,'preserve'));assert.equal((await s.execute('validate_article',{generation_id:generation.id,draft:absent})).errors[0].code,'ARTICLE_COVERAGE');
});
test('inflected forms map and same-string occurrences remain separate',async t=>{
  const {s}=setup(t);const generation=await prepared(s,'retain');const draft=await draftFor(s,reading.replace('retain information','retained information'));const saved=(await call(s,'save_article',{generation_id:generation.id,draft})).article;const maps=saved.word_map.filter(m=>m.word_id===generation.words[0].id);assert.equal(maps.length,2);assert.notEqual(maps[0].occurrence_id,maps[1].occurrence_id);assert.notEqual(maps[0].contextual_meaning,maps[1].contextual_meaning);assert.equal(maps[0].surface_form,'retained');
});
test('article lookup never invokes a model and explicit feedback alone changes level with undo',async t=>{
  const {s}=setup(t);const generation=await prepared(s,'retain');const draft=await draftFor(s);const article=(await call(s,'save_article',{generation_id:generation.id,draft})).article;const before=(await s.execute('list_words')).words[0];await s.execute('get_article',{lesson_id:article.lesson_id});assert.equal((await s.execute('list_words')).words[0].version,before.version);
  const occurrence=article.word_map.find(m=>m.target);const feedback=await call(s,'record_word_feedback',{lesson_id:article.lesson_id,occurrence_id:occurrence.occurrence_id,feedback:'known',expected_version:before.version});assert.equal(feedback.level,3);const undone=await call(s,'undo_event',{event_id:feedback.event_id});assert.equal(undone.word.familiarity_level,1);
  const other=article.word_map.find(m=>!m.target);const suggestion=await call(s,'record_word_feedback',{lesson_id:article.lesson_id,occurrence_id:other.occurrence_id,feedback:'unknown'});assert.ok(suggestion.suggestion);assert.equal((await s.execute('list_words')).words.length,1);
});
test('host image recognition is staged, uncertain items and notes survive confirmation',async t=>{
  const {s}=setup(t);const batch=await call(s,'import_words_from_image',{recognized_items:[{word:'retain',user_note:'保留',uncertain:true},{word:'compelling',uncertain:false}]});assert.equal(batch.items[0].uncertain,true);assert.equal((await s.execute('list_words')).words.length,0);const result=await call(s,'confirm_import',{import_id:batch.import_id,items:batch.items.map(x=>({...x,included:x.word==='retain'}))});assert.equal(result.words[0].user_note,'保留');assert.equal(result.events[0].source,'IMAGE');
});
test('conversation preparation does not record usage; actual transcript distinguishes actor and dedupes',async t=>{
  const {s}=setup(t);await add(s,'retain compelling');const sel=await selection(s,{auto_count:0});const {conversation}=await call(s,'prepare_conversation',{selection_id:sel.id});assert.ok((await s.execute('list_words')).words.every(w=>w.conversation_count===0));const args={conversation_id:conversation.id,actor:'user',text:'The evidence was compelling, and I retained the idea.',request_id:randomUUID()};const usage=await s.execute('record_conversation_usage',args);assert.equal(usage.matched_words.length,2);assert.ok(usage.events.every(e=>e.metadata.actor==='user'));await s.execute('record_conversation_usage',args);assert.ok((await s.execute('list_words')).words.every(w=>w.conversation_count===1));const ai=await call(s,'record_conversation_usage',{conversation_id:conversation.id,actor:'ai',text:'Do you find it compelling?'});assert.equal(ai.matched_words.length,1);const nothing=await call(s,'record_conversation_usage',{conversation_id:conversation.id,actor:'user',text:'I agree.'});assert.equal(nothing.events.length,0);
});
test('restart restores words, requests, history, selection, generation and reading preferences',async t=>{
  const f=setup(t);const generation=await prepared(f.s);const draft=await draftFor(f.s);const article=(await call(f.s,'save_article',{generation_id:generation.id,draft})).article;await call(f.s,'save_preferences',{preferences:{lesson_id:article.lesson_id,reading_scroll:260}});f.restart();assert.equal((await f.s.execute('list_words')).words.length,5);assert.equal((await f.s.execute('get_article',{lesson_id:article.lesson_id})).article.lesson_id,article.lesson_id);assert.equal((await f.s.execute('get_preferences')).preferences.reading_scroll,260);assert.equal((await f.s.execute('get_generation',{generation_id:generation.id})).status,'saved');assert.equal((await f.s.execute('get_selection')).selection.words.length,5);
});
test('parallel identical submits produce one mutation and failures roll back entire import',async t=>{
  const {s}=setup(t);const batch=await call(s,'add_words',{text:'retain compelling'});const args={import_id:batch.import_id,items:batch.items,request_id:randomUUID()};const [one,two]=await Promise.all([s.execute('confirm_import',args),s.execute('confirm_import',args)]);assert.deepEqual(one,two);assert.equal((await s.execute('list_words')).words.length,2);
  const invalid=await call(s,'add_words',{text:'diminish impose'});await assert.rejects(call(s,'confirm_import',{import_id:invalid.import_id,items:invalid.items.map((x,i)=>({...x,level:i?8:1}))}),{code:'INVALID_INPUT'});assert.equal((await s.execute('list_words')).words.length,2);
});
test('host syntax analysis belongs to article and is reopened from saved article',async t=>{
  const {s}=setup(t);const generation=await prepared(s,'retain');const article=(await call(s,'save_article',{generation_id:generation.id,draft:await draftFor(s)})).article;const sentence=article.article.split('. ')[0]+'.';const analysis={main_clause:'evidence suggests',explanation:'测试分析'};await call(s,'save_sentence_analysis',{lesson_id:article.lesson_id,sentence,analysis});assert.deepEqual((await s.execute('get_article',{lesson_id:article.lesson_id})).article.sentence_analyses[0].analysis,analysis);await assert.rejects(call(s,'save_sentence_analysis',{lesson_id:article.lesson_id,sentence:'Not in article.',analysis}),{code:'INVALID_INPUT'});
});
test('fabricated inflections do not satisfy coverage and mapped lemmas must match target',async t=>{
  const {s}=setup(t);const generation=await prepared(s,'retain conventional');const badProse=reading.replaceAll(/retain/gi,'retaines').replace('conventional','conventionaled');const draft=await draftFor(s,badProse);assert.equal((await s.execute('validate_article',{generation_id:generation.id,draft})).errors[0].code,'ARTICLE_COVERAGE');
  const wrongLemma=await draftFor(s);wrongLemma.word_map=wrongLemma.word_map.map(m=>m.lemma==='retain'?{...m,lemma:'retention'}:m);assert.equal((await s.execute('validate_article',{generation_id:generation.id,draft:wrongLemma})).errors[0].code,'ARTICLE_LEMMA');
});
test('editing import to an existing word requires a fresh preview instead of silent readd',async t=>{
  const {s}=setup(t);await add(s,'retain',4);const batch=await call(s,'add_words',{text:'retian'});await assert.rejects(call(s,'confirm_import',{import_id:batch.import_id,items:batch.items.map(x=>({...x,word:'retain'}))}),{code:'IMPORT_REVIEW_REQUIRED'});assert.equal((await s.execute('list_words')).words[0].familiarity_level,4);assert.equal((await s.execute('list_words')).words[0].add_count,1);
});
test('reading feedback requires a current version and rejects stale cross-session feedback',async t=>{
  const f=setup(t);const generation=await prepared(f.s,'retain');const article=(await call(f.s,'save_article',{generation_id:generation.id,draft:await draftFor(f.s)})).article;const occurrence=article.word_map.find(m=>m.target);const before=(await f.s.execute('list_words')).words[0];
  await assert.rejects(call(f.s,'record_word_feedback',{lesson_id:article.lesson_id,occurrence_id:occurrence.occurrence_id,feedback:'unknown'}),{code:'INVALID_INPUT'});
  const peer=createService({dataDir:f.dataDir});try{await call(peer,'update_familiarity',{word_id:before.id,level:4,expected_version:before.version});await assert.rejects(call(f.s,'record_word_feedback',{lesson_id:article.lesson_id,occurrence_id:occurrence.occurrence_id,feedback:'unknown',expected_version:before.version}),{code:'VERSION_CONFLICT'});assert.equal((await f.s.execute('list_words')).words[0].familiarity_level,4);}finally{peer.close();}
});
test('split article preparation preserves the whole locked selection and replayed part IDs',async t=>{
  const {s}=setup(t);const {words}=await add(s,'abandon ability absolute absorb abstract abundant academic accelerate access accommodate accompany accomplish accurate achieve acknowledge acquire adapt adequate',0);const sel=await selection(s,{mode:'mixed',manual_ids:[words[0].id,words[1].id],auto_count:0});const before=(await s.execute('get_selection')).selection;const args={selection_id:sel.id,config:{length:'short',topic:'教育'},request_id:randomUUID()};
  const {plan}=await s.execute('prepare_split_articles',args);assert.ok(plan.parts.length>1);assert.deepEqual([...plan.word_ids].sort(),sel.words.map(w=>w.id).sort());const covered=plan.parts.flatMap(part=>part.words.map(w=>w.id));assert.equal(new Set(covered).size,covered.length);assert.deepEqual([...covered].sort(),[...plan.word_ids].sort());assert.deepEqual((await s.execute('get_selection')).selection,before);
  for(const [index,part] of plan.parts.entries()){assert.equal(part.plan_id,plan.id);assert.equal(part.part_index,index);assert.equal(part.part_count,plan.parts.length);assert.equal((await s.execute('get_generation',{generation_id:part.id})).status,'prepared');assert.equal((await s.execute('get_generation',{generation_id:part.id})).generation.id,part.id);}
  assert.deepEqual((await s.execute('prepare_split_articles',args)).plan,plan);assert.ok((await s.execute('list_words')).words.every(w=>w.article_count===0));
});
test('split preparation on a comfortable load creates one independently saveable complete part',async t=>{
  const {s}=setup(t);await add(s,'retain compelling');const sel=await selection(s,{auto_count:0});const {plan}=await call(s,'prepare_split_articles',{selection_id:sel.id,config:{length:'short'}});assert.equal(plan.parts.length,1);const {article}=await call(s,'save_article',{generation_id:plan.parts[0].id,draft:await draftFor(s)});assert.equal(article.plan_id,plan.id);assert.equal(article.part_index,0);assert.equal(article.part_count,1);assert.ok(article.coverage.every(c=>c.count===2));
});
