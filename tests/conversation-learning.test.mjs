import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createService} from '../server/service.mjs';
import {tools} from '../server/schemas.mjs';

async function setup(t){
  const dataDir=mkdtempSync(join(tmpdir(),'conversation-learning-')),service=createService({dataDir});
  t.after(()=>{service.close();rmSync(dataDir,{recursive:true,force:true});});
  const call=(name,args={})=>service.execute(name,{...args,request_id:args.request_id??randomUUID()});
  const batch=await call('add_words',{text:'retain compelling'});
  const added=await call('confirm_import',{import_id:batch.import_id,items:batch.items.map(item=>({...item,level:4}))});
  const selection=(await call('select_target_words',{mode:'manual',manual_ids:added.words.map(w=>w.id)})).selection;
  const conversation=(await call('prepare_conversation',{selection_id:selection.id,topic:'学习'})).conversation;
  const capture=changes=>call('capture_conversation_word',{conversation_id:conversation.id,word:'resilient',user_utterance:'What does resilient mean?',explanation:'adj. 有韧性的；能够恢复的',turn_id:'user-turn-1',...changes});
  return {service,call,capture,conversation,added};
}
test('capture a real meaning question outside target set with explanation and undo, without invented usage',async t=>{
  const {service,call,capture}=await setup(t);const result=await capture({});
  tools.find(t=>t.name==='capture_conversation_word').outputSchema.parse(result);
  assert.equal(result.status,'added');assert.equal(result.captured_word.learning_status,'needs_review');assert.equal(result.captured_word.familiarity_level,0);assert.equal(result.captured_word.conversation_count,0);
  assert.equal(result.captured_word.meaning,'adj. 有韧性的；能够恢复的');
  assert.equal((await service.execute('search_words',{query:'resilient'})).words.length,1);
  await call('undo_event',{event_id:result.event_id});assert.equal((await service.execute('search_words',{query:'resilient'})).words.length,0);
});
test('existing word preserves notes and add counts, protects versions, and can undo review marker',async t=>{
  const {call,capture,added}=await setup(t);const before=(await call('update_familiarity',{word_id:added.words[0].id,user_note:'我的独立笔记',expected_version:added.words[0].version})).word;
  const args={word:before.word,user_utterance:`${before.word} 什么意思？我没理解。`,expected_version:before.version};
  await assert.rejects(capture({...args,expected_version:before.version-1}),{code:'VERSION_CONFLICT'});
  const result=await capture(args);assert.equal(result.status,'marked_for_review');assert.equal(result.captured_word.familiarity_level,1);assert.equal(result.captured_word.user_note,before.user_note);assert.equal(result.captured_word.add_count,before.add_count);assert.equal(result.captured_word.last_added_at,before.last_added_at);
  const restored=await call('undo_event',{event_id:result.event_id});assert.equal(restored.word.familiarity_level,4);assert.equal(restored.word.learning_status,before.learning_status);
});
test('technical retry and same-turn semantic retry cannot duplicate or downgrade later manual edits',async t=>{
  const {service,call,capture}=await setup(t);const request_id=randomUUID();const first=await capture({request_id});assert.deepEqual(await capture({request_id}),first);
  const edited=(await call('update_familiarity',{word_id:first.captured_word.id,level:4,expected_version:first.captured_word.version})).word;
  const replay=await capture({});assert.equal(replay.status,'already_recorded');assert.equal(replay.captured_word.version,edited.version);assert.equal(replay.captured_word.familiarity_level,4);
  assert.equal(service.repository.events(edited.id).filter(e=>e.type==='ADD').length,1);
  const second=await capture({turn_id:'user-turn-2',expected_version:edited.version});assert.equal(second.captured_word.familiarity_level,1);assert.equal(second.captured_word.add_count,1);
});
test('no automatic capture from ordinary word occurrence, unrelated evidence, invalid words or disabled context',async t=>{
  const {service,capture,conversation}=await setup(t);
  await assert.rejects(capture({user_utterance:'I am resilient and I like reading.'}),{code:'INVALID_INPUT'});
  await assert.rejects(capture({user_utterance:'What does retain mean?'}),{code:'INVALID_INPUT'});
  await assert.rejects(capture({word:'陌生词',user_utterance:'陌生词是什么意思？'}),{code:'INVALID_INPUT'});
  await assert.rejects(capture({explanation:''}),{code:'INVALID_INPUT'});
  service.repository.put('conversation',conversation.id,{...conversation,auto_capture_new_words:false});
  await assert.rejects(capture({}),{code:'INVALID_INPUT'});
  assert.equal((await service.execute('list_words')).words.length,2);
});
test('a reversed capture cannot resurrect a word on retry with a new request',async t=>{
  const {call,capture}=await setup(t);const result=await capture({});await call('undo_event',{event_id:result.event_id});await assert.rejects(capture({}),{code:'INVALID_INPUT'});
});
