import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';

const dataDir=await mkdtemp(path.join(tmpdir(),'tablet-controls-'));
const service=createService({dataDir}), harness=await startHarness(service);
const call=(name,args={})=>service.execute(name,{...args,request_id:randomUUID()});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const batch=await call('add_words',{text:'retain compelling diminish'});
  const added=await call('confirm_import',{import_id:batch.import_id,items:batch.items});
  await call('select_target_words',{mode:'manual',manual_ids:added.words.map(w=>w.id)});
  const page=await browser.newPage({viewport:{width:1280,height:854}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(harness.url);const ui=page.frameLocator('#app');
  await ui.getByText('词库已连接',{exact:true}).waitFor();
  await mkdir('docs/previews',{recursive:true});
  for(const width of [1280,820,600,320]){
    await page.setViewportSize({width,height:854});
    const workspace=await ui.locator('.library-workspace').boundingBox();
    const shell=await ui.locator('.app-shell').boundingBox();
    assert.ok(workspace.y-shell.y<=106,'Header and navigation should leave the study cards near the top');
    assert.ok(workspace.height>=700,'Study cards should use most of the tablet viewport');
    const picker=ui.getByRole('combobox',{name:'加入时间',exact:true});
    for(let i=0;i<3;i++){
      await picker.click();const menu=ui.getByRole('listbox',{name:'加入时间选项'});await expect(menu).toBeVisible();
      const bounds=await menu.boundingBox(),anchor=await picker.boundingBox();
      assert.ok(bounds.y>=anchor.y+anchor.height,'Time picker must always open below its trigger');
      assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
      await expect(menu.getByRole('option')).toHaveCount(5);
      if(width===1280&&i===0)await page.screenshot({path:'docs/previews/tablet-time-picker.png'});
      await picker.press('Escape');await expect(menu).toHaveCount(0);
    }
    await picker.press('ArrowDown');await picker.press('ArrowDown');await picker.press('Enter');
    await expect(picker).toHaveText('今天');
    await picker.click();await ui.getByRole('option',{name:'全部时间',exact:true}).click();
    await picker.click();await ui.getByRole('searchbox').click();await expect(ui.getByRole('listbox')).toHaveCount(0);
  }
  await page.setViewportSize({width:1280,height:854});
  await ui.locator('.filter-details summary').click();
  const sizes=await ui.locator('.level-options .level-glyph').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.width,r.height];}));
  assert.equal(sizes.length,5);assert.deepEqual(sizes,Array(5).fill([54,18]));
  assert.deepEqual(await ui.locator('.level-options label>span').allTextContents(),['Lv.1','Lv.2','Lv.3','Lv.4','Lv.5']);
  assert.deepEqual(await ui.locator('.word-row select').first().locator('option').allTextContents(),['Lv.1','Lv.2','Lv.3','Lv.4','Lv.5']);
  await page.screenshot({path:'docs/previews/tablet-level-filter.png'});
  await ui.locator('.filter-details summary').click();
  await ui.getByRole('button',{name:'英语交流',exact:true}).click();
  await ui.getByLabel('话题',{exact:true}).fill('旅行');
  await ui.getByRole('textbox',{name:'自定义开场白',exact:true}).fill('Which place would you like to visit next?');
  await expect(ui.getByRole('button',{name:'准备交流上下文',exact:true})).toHaveCount(0);
  const before=harness.messages.length;
  await ui.getByRole('button',{name:'开始交流',exact:true}).click();
  await expect(ui.locator('.voice-ready')).toContainText('麦克风右边');
  assert.equal(harness.messages.length,before,'Preparation must not send any conversation message');
  assert.deepEqual(await page.evaluate(()=>window.modelContexts.at(-1).content),[],
    'Practice context must clear composer attachments and only supply background state');
  const context=await page.evaluate(()=>window.modelContexts.at(-1).structuredContent.vocabulary_conversation);
  assert.equal(context.topic,'旅行');assert.equal(context.opening,'Which place would you like to visit next?');assert.equal(context.words.length,3);
  assert.match(context.instructions,/preparation only/);
  await expect(ui.locator('.conversation-action>button')).toHaveCount(1);
  assert.ok((await service.execute('list_words')).words.every(word=>word.conversation_count===0));
  await page.screenshot({path:'docs/previews/tablet-conversation.png'});
  await ui.getByLabel('话题',{exact:true}).fill('大学学习');
  await expect(ui.locator('.voice-ready')).toHaveCount(0);
  await expect(ui.getByRole('button',{name:'开始交流',exact:true})).toBeEnabled();
  await page.evaluate(()=>{window.rejectMessages=true;});
  await ui.getByRole('button',{name:'开始交流',exact:true}).click();
  await expect(ui.locator('.voice-ready')).toBeVisible();
  assert.equal(harness.messages.length,before,'Preparation does not depend on chat sending');
  await ui.getByLabel('话题',{exact:true}).fill('职业');
  await page.evaluate(()=>{window.rejectModelContext=true;});
  await ui.getByRole('button',{name:'开始交流',exact:true}).click();
  await ui.getByText('练习设置已保存，但当前客户端未确认接收上下文。请重试；没有自动发送聊天消息。',{exact:true}).waitFor();
  await expect(ui.locator('.voice-ready')).toHaveCount(0);
  assert.equal(harness.messages.length,before,'Unsupported context must never fall back to an automatic message');
  const captured=await call('capture_conversation_word',{conversation_id:context.conversation_id,word:'resilient',user_utterance:'What does resilient mean?',explanation:'adj. 有韧性的；能恢复的',turn_id:'real-test-user-turn'});
  await page.evaluate(result=>window.sendToolResult({structuredContent:result,content:[]}),captured);
  await ui.getByRole('button',{name:'词库',exact:true}).click();
  await expect(ui.locator('.word-row').filter({hasText:'resilient'})).toContainText('对话生词');
  await ui.getByRole('button',{name:'撤销上次操作',exact:true}).click();
  await expect(ui.locator('.word-row').filter({hasText:'resilient'})).toHaveCount(0);
  assert.deepEqual(errors,[]);
  console.log('Tablet controls verified: downward popover, viewport bounds, keyboard and dismissal, equal glyph geometry, single conversation handoff with full context, no fabricated usage.');
} finally {await browser.close();await harness.close();service.close();await rm(dataDir,{recursive:true,force:true});}
