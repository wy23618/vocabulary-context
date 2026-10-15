import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';
import { buildReviewDraft } from './fixtures/review-draft.mjs';

const dataDir=await mkdtemp(path.join(tmpdir(),'vocab-redesign-'));
const service=createService({dataDir});
const call=(name,args={})=>service.execute(name,{...args,request_id:randomUUID()});
const harness=await startHarness(service);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const batch=await call('add_words',{text:'compelling retain diminish impose conventional'});
  const added=await call('confirm_import',{import_id:batch.import_id,items:batch.items});
  const selection=(await call('select_target_words',{mode:'manual',manual_ids:added.words.map(w=>w.id)})).selection;
  const generation=(await call('prepare_article',{selection_id:selection.id,config:{topic:'AI 与大学学习',length:'short'}})).generation;
  const draft=await buildReviewDraft(service);
  const article=(await call('save_article',{generation_id:generation.id,draft})).article;
  const occurrence=article.word_map.find(m=>m.lemma==='retain');
  const details={phonetic:'/rɪˈteɪn/',definitions:[{part_of_speech:'v.',meaning:'保留；保持'},{part_of_speech:'v.',meaning:'记住；保持在记忆中'}],related_words:[{word:'retention',meaning:'n. 保留；记忆力'},{word:'retentive',meaning:'adj. 记忆力强的'}],synonyms:[{word:'keep',meaning:'保留，语气较日常'},{word:'preserve',meaning:'保护并维持原状'}],example:{sentence:'Regular review helps students retain new vocabulary.',translation:'定期复习帮助学生记住新词汇。'}};
  await assert.rejects(call('save_word_details',{lesson_id:article.lesson_id,occurrence_id:occurrence.occurrence_id,details:{phonetic:'x'}}),{code:'INVALID_INPUT'});
  await assert.rejects(call('save_word_details',{lesson_id:article.lesson_id,occurrence_id:'missing',details}),{code:'INVALID_INPUT'});
  const extra=await call('add_words',{text:Array.from({length:32},(_,i)=>`sample${String.fromCharCode(97+Math.floor(i/26))}${String.fromCharCode(97+i%26)}`).join(' ')});
  await call('confirm_import',{import_id:extra.import_id,items:extra.items});
  const page=await browser.newPage({viewport:{width:1280,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(harness.url);
  const ui=page.frameLocator('#app');await ui.getByText('词库已连接',{exact:true}).waitFor();
  await expect(ui.locator('.word-row')).toHaveCount(12);
  for(const width of [1280,820,600]){
    await page.setViewportSize({width,height:854});
    const rows=ui.locator('.word-row');
    const a=await rows.nth(0).boundingBox(),b=await rows.nth(1).boundingBox();
    if(width>=820){
      assert.ok(Math.abs(a.y-b.y)<1 && b.x>a.x+a.width,'Wide library must show two word columns');
    }else assert.ok(b.y>=a.y+a.height,'Narrow library must keep readable single-column words');
    const panel=await ui.locator('.library-main').boundingBox();
    const list=await ui.locator('.word-list').boundingBox();
    assert.ok(list.height/panel.height>0.65,'Words must occupy most of the library card');
  }
  await page.setViewportSize({width:1280,height:960});
  const first=ui.locator('.word-row').first();const firstWord=await first.locator('strong').textContent();
  await first.getByRole('checkbox').check();
  await ui.getByRole('button',{name:'下一页',exact:true}).click();await expect(ui.locator('.page-buttons')).toContainText('2 / 4');
  await ui.getByRole('button',{name:'上一页',exact:true}).click();await expect(ui.locator('.word-row').filter({hasText:firstWord}).getByRole('checkbox')).toBeChecked();
  await ui.getByRole('button',{name:'下一页',exact:true}).click();await ui.getByRole('searchbox').fill('retain');await expect(ui.locator('.word-row')).toHaveCount(1);await expect(ui.locator('.page-buttons')).toContainText('1 / 1');
  await ui.getByRole('searchbox').fill('');await expect(ui.locator('.word-row')).toHaveCount(12);
  await ui.getByLabel('每页词数',{exact:true}).selectOption('24');await expect(ui.locator('.word-row')).toHaveCount(24);
  await ui.getByLabel('每页词数',{exact:true}).selectOption('12');
  await expect(ui.getByRole('button',{name:'自动',exact:true})).toHaveCount(0);
  await expect(ui.getByRole('button',{name:'混合',exact:true})).toHaveCount(0);
  await ui.getByRole('checkbox',{name:'带上今天加入的词',exact:true}).uncheck();
  await ui.getByRole('spinbutton',{name:'复习旧词数量',exact:true}).fill('0');
  await ui.getByRole('button',{name:'选择目标词',exact:true}).click();
  const picked=(await call('get_selection')).selection;assert.deepEqual(picked.words.map(w=>w.word),[...added.words.map(w=>w.word),firstWord]);assert.equal(picked.include_today,false);
  await ui.getByRole('button',{name:'词库',exact:true}).click();
  await mkdir('docs/previews',{recursive:true});await page.screenshot({path:'docs/previews/redesign-library.png'});
  await ui.getByRole('button',{name:'英语交流',exact:true}).click();
  const opening=await ui.locator('.opening').textContent();await ui.getByRole('button',{name:'换个推荐开场 ↻'}).click();assert.notEqual(await ui.locator('.opening').textContent(),opening);
  await ui.getByLabel('话题',{exact:true}).fill('亲戚与家庭');await expect(ui.locator('.opening')).toContainText('family');
  await ui.getByRole('button',{name:'开始交流',exact:true}).click();await ui.getByText('准备好了，可以开始交流',{exact:true}).waitFor();
  await ui.getByLabel('话题',{exact:true}).fill('旅行');await ui.getByRole('button',{name:'开始交流',exact:true}).click();await ui.getByText('准备好了，可以开始交流',{exact:true}).waitFor();
  const authoredOpening='Tell me about a trip that changed your perspective.';
  await ui.getByRole('textbox',{name:'自定义开场白',exact:true}).fill(authoredOpening);
  await expect(ui.locator('.opening')).toHaveText(authoredOpening);
  await ui.getByRole('button',{name:'开始交流',exact:true}).click();
  await expect(ui.locator('.voice-ready')).toContainText('绿色声波按钮');
  assert.equal(harness.messages.length,0,'Preparation must not send a chat message');
  const supplied=await page.evaluate(()=>window.modelContexts.at(-1).structuredContent.vocabulary_conversation);
  assert.equal(supplied.opening,authoredOpening);assert.equal(supplied.topic,'旅行');assert.deepEqual(supplied.words.map(w=>w.word),picked.words.map(w=>w.word));
  await expect(ui.getByRole('button',{name:'准备语音对话',exact:true})).toHaveCount(0);
  await page.waitForTimeout(1100);
  const preferences=(await call('get_preferences')).preferences;
  const storedConversation=(await call('get_conversation_context',{conversation_id:preferences.conversation_id})).conversation;
  assert.equal(storedConversation.custom_opening,authoredOpening);assert.equal(storedConversation.opening,authoredOpening);
  await page.reload();await ui.getByText('词库已连接',{exact:true}).waitFor();
  await expect(ui.getByRole('textbox',{name:'自定义开场白',exact:true})).toHaveValue(authoredOpening);
  await expect(ui.locator('.opening')).toHaveText(authoredOpening);
  await page.screenshot({path:'docs/previews/redesign-conversation.png'});
  await page.evaluate(article=>window.sendToolResult({structuredContent:{article},content:[]}),article);
  const trigger=ui.locator('.word').filter({hasText:/^retain$/i}).first();await trigger.click();
  await ui.getByRole('button',{name:'补全音标、词族与例句 ↗'}).click();await expect.poll(()=>harness.messages.at(-1)?.content[0].text).toContain('save_word_details');
  const saved=await call('save_word_details',{lesson_id:article.lesson_id,occurrence_id:occurrence.occurrence_id,details});
  await page.evaluate(result=>window.sendToolResult({structuredContent:result,content:[]}),saved);
  await expect(ui.locator('.pronunciation')).toContainText('/rɪˈteɪn/');await expect(ui.locator('.dictionary-details')).toContainText('retention');await expect(ui.locator('.example-translation')).toContainText('定期复习');
  // A duplicate tool response must not dismiss a selected word or reset reading position.
  await ui.locator('.article-pane').evaluate(el=>{el.scrollTop=180;});
  const oldScroll=await ui.locator('.article-pane').evaluate(el=>el.scrollTop);
  await page.evaluate(article=>window.sendToolResult({structuredContent:{article},content:[]}),article);
  await expect(ui.getByRole('heading',{name:'retain',exact:true})).toBeVisible();
  assert.equal(await ui.locator('.article-pane').evaluate(el=>el.scrollTop),oldScroll);
  const reopened=(await call('get_article',{lesson_id:article.lesson_id})).article;
  assert.equal(reopened.word_map.find(m=>m.occurrence_id===occurrence.occurrence_id).example.sentence,details.example.sentence);
  assert.deepEqual(reopened.word_map.filter(m=>m.occurrence_id!==occurrence.occurrence_id),article.word_map.filter(m=>m.occurrence_id!==occurrence.occurrence_id));
  assert.equal(reopened.article,article.article);
  await ui.locator('.definition-panel').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:'docs/previews/redesign-dictionary.png'});
  for(const [width,height] of [[320,680],[600,820],[820,1180],[1440,900],[1180,480]]){
    await page.setViewportSize({width,height});
    for(const task of ['词库','目标词与阅读','英语交流','历史文章']){
      await ui.getByRole('button',{name:task,exact:true}).click();
      const dims=await ui.locator('html').evaluate(el=>({w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight}));assert.ok(dims.sw<=dims.w+1);assert.ok(dims.sh<=dims.h+1,`Document scroll in ${task}: ${dims.sh}/${dims.h}`);
      if(task==='词库'&&width<=790){await ui.getByRole('button',{name:'准备词组 →'}).click();await expect(ui.getByRole('heading',{name:'这次学哪些词'})).toBeVisible();await ui.getByRole('button',{name:'← 返回词库'}).click();}
    }
  }
  // Waiting for the host model should produce no recurring resize notifications.
  await page.setViewportSize({width:1280,height:960});
  await ui.getByRole('button',{name:'目标词与阅读',exact:true}).click();
  await ui.getByRole('button',{name:'用这组词生成文章'}).click();
  await ui.getByRole('button',{name:'等待 ChatGPT 完成文章…'}).waitFor();
  await page.waitForTimeout(250);
  const geometry=await ui.locator('.app-shell').evaluate(el=>({height:el.offsetHeight,top:el.getBoundingClientRect().top}));
  const sizesBefore=await page.evaluate(()=>window.sizeNotifications.length);
  await page.waitForTimeout(4300);
  assert.deepEqual(await ui.locator('.app-shell').evaluate(el=>({height:el.offsetHeight,top:el.getBoundingClientRect().top})),geometry);
  assert.equal(await page.evaluate(()=>window.sizeNotifications.length),sizesBefore);
  await ui.getByRole('button',{name:'暂时停止检查',exact:true}).click();
  const start=performance.now();for(let i=0;i<40;i++)await call('tokenize_article',{article:draft.article});const tokenizeMs=(performance.now()-start)/40;
  const validateStart=performance.now();for(let i=0;i<40;i++)await call('validate_article',{generation_id:generation.id,draft});const validateMs=(performance.now()-validateStart)/40;
  console.log(`Local authored 255-word passage processing: tokenize ${tokenizeMs.toFixed(2)} ms, validate ${validateMs.toFixed(2)} ms (40 runs each).`);
  assert.deepEqual(errors,[]);
  console.log('Redesign verified: bounded paging, cross-page selections, filter reset, changing conversation, enrichment validation and persistence, responsive dictionary.');
} finally {await browser.close();await harness.close();service.close();await rm(dataDir,{recursive:true,force:true});}
