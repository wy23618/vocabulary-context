import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createService} from '../server/service.mjs';
import {tools} from '../server/schemas.mjs';
import {conversationLaunchMessage,conversationOpening} from '../shared/conversation.mjs';

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

test('review retains non-target speech, validates user evidence and survives retries and reopening',async t=>{
  const {call,conversation,service}=await setup(t);
  assert.match(conversation.context,/FIRST spoken response must be in English/);
  assert.ok(conversation.context.includes(conversation.opening));
  const review={conversation_id:conversation.id,summary:'过去时需要练习。',strengths:['能够表达旅行经历。'],gaps:[{kind:'grammar',turn_id:'user-1',quote:'I go there yesterday.',correction:'I went there yesterday.',explanation:'yesterday 表示过去，应使用 went。'}],next_steps:['用过去时描述一次旅行。']};
  await assert.rejects(call('save_conversation_review',review),{code:'INVALID_INPUT'});
  const args={conversation_id:conversation.id,actor:'user',turn_id:'user-1',text:'I go there yesterday.'};
  const turn=await call('record_conversation_usage',args);assert.equal(turn.matched_words.length,0);
  tools.find(t=>t.name==='record_conversation_usage').outputSchema.parse(turn);
  await call('record_conversation_usage',args);
  await assert.rejects(call('record_conversation_usage',{...args,text:'A different turn.'}),{code:'INVALID_INPUT'});
  await call('record_conversation_usage',{conversation_id:conversation.id,actor:'ai',turn_id:'ai-1',text:'Where did you go?'});
  await assert.rejects(call('save_conversation_review',{...review,gaps:[{...review.gaps[0],turn_id:'ai-1',quote:'Where did you go?'}]}),{code:'INVALID_INPUT'});
  await assert.rejects(call('save_conversation_review',{...review,gaps:[{...review.gaps[0],quote:'Invented speech.'}]}),{code:'INVALID_INPUT'});
  const request_id=randomUUID();const saved=await call('save_conversation_review',{...review,request_id});
  assert.deepEqual(await call('save_conversation_review',{...review,request_id}),saved);
  tools.find(t=>t.name==='save_conversation_review').outputSchema.parse(saved);
  const reopened=(await call('get_conversation_context',{conversation_id:conversation.id})).conversation;
  assert.equal(reopened.turns.length,2);assert.deepEqual(reopened.review,saved.review);
  assert.ok((await service.execute('list_words')).words.every(word=>word.familiarity_level===4));
});

test('a new request id for the same stable turn cannot count usage twice',async t=>{
  const {call,conversation,service}=await setup(t);
  const args={conversation_id:conversation.id,actor:'user',turn_id:'stable-user-turn',text:'This is compelling.'};
  await call('record_conversation_usage',args);await call('record_conversation_usage',args);
  assert.equal((await service.execute('search_words',{query:'compelling'})).words[0].conversation_count,1);
});

test('free practice needs no selection and launch message carries exact practice data and voice instructions',async t=>{
  const {call}=await setup(t);
  const input=tools.find(tool=>tool.name==='prepare_conversation').inputSchema.parse({topic:'关于爱',custom_opening:'How do you show love?',request_id:randomUUID()});
  const {conversation}=await call('prepare_conversation',input);
  assert.equal(conversation.selection_id,null);assert.deepEqual(conversation.words,[]);
  const context=conversationLaunchMessage(conversation);
  assert.ok(context.includes(conversation.id));assert.ok(context.includes('关于爱'));assert.ok(context.includes('How do you show love?'));
  assert.match(context,/不要在文字里说出开场白/);assert.match(context,/FIRST spoken response must be in English/);
  assert.match(context,/greeting or short Chinese reply is not a topic or language change/);
  assert.match(conversationOpening('关于爱'),/love/);
});
