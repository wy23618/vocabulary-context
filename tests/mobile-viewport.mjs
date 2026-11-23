// Regression for a real host shape the full-size tablet harness did not cover:
// small initial iframe, absent mode metadata, and native-only fullscreen APIs.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';
import { viewportLayout, requestPresentation } from '../web/viewport.mjs';

assert.equal(viewportLayout({}, 160).height, 640);
assert.equal(viewportLayout({containerDimensions:{height:160}},160).height,560);
assert.equal(viewportLayout({containerDimensions:{height:160}},560).height,560,'Do not oscillate when the host accepts a resize but sends stale dimensions');
assert.equal(viewportLayout({displayMode:'fullscreen',containerDimensions:{height:800}},800).height,800);
assert.equal(viewportLayout({}, 800).height,800, 'Cleared host constraints must not preserve a stale height');
assert.equal(viewportLayout({}, 320).height,320, 'Real short landscape windows must retain their compact layout');
let bridgeCalls=0;
const mockBridge={getHostContext:()=>({availableDisplayModes:['inline','fullscreen']}),requestDisplayMode:async()=>{bridgeCalls++;return {mode:'fullscreen'};}};
assert.equal(await requestPresentation(mockBridge,'fullscreen',{requestDisplayMode:async()=>{throw new Error('native unavailable');}}),'fullscreen');
assert.equal(bridgeCalls,1);
assert.equal(await requestPresentation({...mockBridge,requestDisplayMode:async()=>({mode:'inline'})},'fullscreen',{}),'inline', 'Respect the mode actually granted');

const dataDir=await mkdtemp(path.join(tmpdir(),'mobile-viewport-'));
const service=createService({dataDir});
const batch=await service.execute('add_words',{text:'retain compelling diminish approach allocate amend assume benefit clarify define emerge engage expand focus generate identify imply maintain obtain persist refine resolve sustain verify',request_id:randomUUID()});
await service.execute('confirm_import',{import_id:batch.import_id,items:batch.items,request_id:randomUUID()});
const browser=await chromium.launch({channel:'chrome',headless:true});
const output='docs/previews';await mkdir(output,{recursive:true});
try {
  for(const test of [
    {name:'tablet-missing-modes',viewport:{width:820,height:1180},frameHeight:160,resizeToContent:true,omitDisplayModes:true},
    {name:'tablet-native-fullscreen',viewport:{width:1180,height:820},frameHeight:180,nativeFullscreen:true,hostContext:{availableDisplayModes:['inline']}},
    {name:'tablet-inline-only',viewport:{width:320,height:900},frameHeight:180,grantFullscreen:false,hostContext:{availableDisplayModes:['inline'],containerDimensions:{height:180,width:320}}},
    {name:'tablet-short-landscape',viewport:{width:844,height:390},short:true},
  ]) {
    const harness=await startHarness(service,{platform:'mobile',...test});
    const page=await browser.newPage({viewport:test.viewport,hasTouch:true,isMobile:true});
    try {
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(harness.url);const ui=page.frameLocator('#app');
      await expect(ui.locator('.connection')).toHaveText('词库已连接');
      const expand=ui.getByRole('button',{name:'展开学习界面',exact:true});
      await expect(expand).toBeVisible();
      if(!test.short)await expect.poll(()=>page.evaluate(()=>window.sizeNotifications.some(x=>x.height>=560))).toBe(true);
      assert.ok((await page.evaluate(()=>window.appCapabilities)).availableDisplayModes.includes('fullscreen'));
      await page.screenshot({path:`${output}/${test.name}-inline.png`});
      await expand.click();
      if(test.grantFullscreen===false) {
        await expect(ui.getByRole('status')).toContainText('当前客户端未开放全屏');
        const search=ui.getByRole('searchbox');await search.fill('retain');
        await expect(ui.locator('.word-row')).toHaveCount(1);
        await ui.locator('.word-row').first().scrollIntoViewIfNeeded();
        await expect(ui.locator('.word-row').first()).toBeInViewport();
        await ui.locator('.word-row input[type=checkbox]').check();
        await expect.poll(async()=>(await service.execute('get_selection',{})).selection?.words?.some(x=>x.word==='retain')).toBe(true);
        await page.screenshot({path:`${output}/${test.name}-scrolled.png`});
        assert.equal(await page.evaluate(()=>window.displayRequests.length),0,'Do not request a mode explicitly ruled out by the host');
      } else {
        await expect(ui.getByRole('button',{name:'收起学习界面',exact:true})).toBeVisible();
        await expect(ui.locator('.word-row').first()).toBeInViewport();
        if(test.nativeFullscreen) {
          assert.deepEqual(await page.evaluate(()=>window.nativeDisplayRequests),['fullscreen']);
          assert.ok(await page.evaluate(()=>window.nativeHeightNotifications.some(x=>x>=560)));
          const composerTop=await page.evaluate(() => {
            // Model the host-owned input box floating over the iframe.
            const composer=document.createElement('input');
            composer.placeholder='回复 ChatGPT';
            composer.style.cssText='position:fixed;z-index:1;bottom:24px;left:25%;width:50%;height:52px;box-sizing:border-box;border:1px solid #ddd;border-radius:26px;padding:0 18px';
            document.body.append(composer);
            return composer.getBoundingClientRect().top;
          });
          const list=ui.locator('.word-list');
          const pager=ui.getByRole('navigation',{name:'词库分页'});
          const next=ui.getByRole('button',{name:'下一页'});
          const previous=ui.getByRole('button',{name:'上一页'});
          const box=await list.boundingBox(), pagerBox=await pager.boundingBox();
          assert.ok(pagerBox.y+pagerBox.height<=box.y+1,'Pagination stays above the scrolling words');
          assert.ok(box.y+box.height<=composerTop,'All word rows can scroll above the composer');
          assert.ok((await next.boundingBox()).height>=44,'Touch-friendly pagination target');

          const touch=await page.context().newCDPSession(page);
          const listX=box.x+36, upperY=box.y+24, lowerY=box.y+Math.min(box.height-20, 180);
          async function swipe(x, from, to) {
            await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
            for(let step=1;step<=8;step++) {
              await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*step/8}]});
            }
            // Pause before lifting so a fling cannot consume the next tap.
            await page.waitForTimeout(150);
            await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          }
          await swipe(listX,lowerY,upperY);
          await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);
          await swipe(listX,upperY,lowerY);
          await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBeLessThan(30);
          await swipe(listX,lowerY,upperY);
          await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);
          await next.tap();
          await expect(pager.locator('[aria-live]')).toHaveText('2 / 2');
          await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBe(0);
          await previous.tap();
          await expect(pager.locator('[aria-live]')).toHaveText('1 / 2');

          // An upward swipe outside the word list scrolls the whole workspace.
          await page.setViewportSize({width:1180,height:590});
          await page.evaluate(()=>window.setHostContext({containerDimensions:{height:568,width:1180}}));
          const shell=ui.locator('.app-shell');
          await expect.poll(()=>shell.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(100);
          await swipe(8,340,100);
          await expect.poll(()=>shell.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
          assert.equal(await list.evaluate(el=>el.scrollTop),0,'Page scrolling leaves the word list position alone');
          const settings=await ui.getByRole('button',{name:'交流设置',exact:true}).boundingBox();
          const overlay=await page.getByPlaceholder('回复 ChatGPT').boundingBox();
          assert.ok(settings.y+settings.height<=overlay.y,'Page scrolling reveals the bottom controls above the composer');
          await swipe(8,100,340);
          await expect.poll(()=>shell.evaluate(el=>el.scrollTop)).toBe(0);
          await page.setViewportSize(test.viewport);
          await page.evaluate(()=>window.setHostContext({containerDimensions:{height:window.innerHeight-22,width:window.innerWidth}}));
          await touch.detach();
        } else assert.deepEqual(await page.evaluate(()=>window.displayRequests),['fullscreen']);
        await page.screenshot({path:`${output}/${test.name}.png`});
        await page.setViewportSize({width:1180,height:820});
        await page.evaluate(()=>window.setHostContext({containerDimensions:{height:window.innerHeight-22,width:window.innerWidth}}));
        await expect.poll(()=>ui.locator('.app-shell').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(798);
        await expect(ui.locator('.word-row').first()).toBeInViewport();
        await page.screenshot({path:`${output}/${test.name}-landscape.png`});
      }
      const sizes=await ui.locator('html').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
      assert.ok(sizes.scroll<=sizes.width+1,`No horizontal clipping in ${test.name}`);
      assert.deepEqual(errors,[]);
    } catch(error) {
      await page.screenshot({path:`${output}/${test.name}-failure.png`});
      console.error(test.name,await page.frameLocator('#app').locator('button').evaluateAll(es=>es.slice(0,8).map(e=>({text:e.innerText,label:e.getAttribute('aria-label')}))));
      throw error;
    } finally {await page.close();await harness.close();}
  }
  console.log('Mobile host regression passed: collapsed card growth, missing capabilities, native fullscreen, declined fullscreen with scrolling, portrait/landscape and stale dimension reset.');
} finally {await browser.close();service.close();await rm(dataDir,{recursive:true,force:true});}
