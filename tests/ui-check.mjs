// Actual browser + standard MCP App bridge, using a disposable real SQLite store.
// This is a development protocol harness, never proof of ChatGPT installation.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';

const output = path.resolve('docs/previews');
await mkdir(output, { recursive: true }); await mkdir('test-results', { recursive: true });
const dataDir = await mkdtemp(path.join(tmpdir(), 'vocab-ui-'));
let clock = '2026-10-14T04:00:00Z';
const service = createService({ dataDir, now: () => new Date(clock) });
const calls = [], errors = [], checks = []; let workspaceGate = null, workspaceObserved = null;
const instrumented = { execute: async (name, args) => { calls.push({ name, args }); const result = await service.execute(name, args); if (name === 'open_workspace' && workspaceGate) { workspaceObserved?.(); await workspaceGate; } return result; } };
const harness = await startHarness(instrumented);
let browser, page;
const direct = (name, args = {}) => service.execute(name, { ...args, request_id: randomUUID() });
const check = (name, fn) => Promise.resolve().then(fn).then(() => checks.push({ name, passed: true }));
async function connected(page) { await page.goto(harness.url); const frame = page.frameLocator('#app'); await frame.getByText('词库已连接', { exact: true }).waitFor({ timeout: 15000 }); return frame; }
async function noOverflow(frame) { const value = await frame.locator('html').evaluate(el => ({ viewport: el.clientWidth, width: el.scrollWidth })); assert.ok(value.width <= value.viewport + 1, `Horizontal overflow ${value.width}/${value.viewport}`); }
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  let ui = await connected(page);
  await check('empty library renders through actual MCP App initialize/tools bridge', async () => { await ui.getByText('从今天的几个词开始').waitFor(); await noOverflow(ui); await page.screenshot({ path: path.join(output, 'empty-tablet.png') }); });
  await check('text import, duplicate preview, editable confirmation, true persistence', async () => {
    await ui.getByRole('button', { name: '＋ 加入单词' }).click();
    await ui.getByRole('textbox', { name: '输入或粘贴单词' }).fill('compelling\nretain\ndiminish\nimpose\nconventional\nretain');
    await ui.getByRole('button', { name: '检查并确认' }).click();
    await ui.getByText('5 个候选词').waitFor();
    await ui.getByRole('textbox', { name: 'compelling 中文笔记' }).fill('有说服力的；令人信服的');
    await page.screenshot({ path: path.join(output, 'import-confirm-tablet.png') });
    await ui.getByRole('button', { name: '确认加入 5 个词' }).click();
    await ui.getByText('已保存 5 个词。', { exact: true }).waitFor();
    assert.equal((await service.execute('list_words')).words.length, 5);
    await page.screenshot({ path: path.join(output, 'library-tablet.png') });
  });
  await check('level update, real readd downgrade preview and restore original', async () => {
    await ui.getByRole('combobox', { name: 'retain 熟练度', exact: true }).selectOption('4');
    await ui.getByText('已保存。', { exact: true }).waitFor();
    await ui.getByRole('button', { name: '＋ 加入单词' }).click(); await ui.getByRole('textbox', { name: '输入或粘贴单词' }).fill('retain'); await ui.getByRole('button', { name: '检查并确认' }).click();
    await ui.getByText('已存在 · 再次加入 4 → 3').waitFor();
    await ui.getByRole('button', { name: '恢复原等级' }).click();
    await ui.getByRole('button', { name: '确认加入 1 个词' }).click();
    await ui.getByText('已保存 1 个词。', { exact: true }).waitFor();
    const word = (await service.execute('search_words', { query: 'retain' })).words[0]; assert.equal(word.familiarity_level, 4); assert.equal(word.add_count, 2);
    await ui.getByRole('button', { name: '撤销上次操作' }).click(); await ui.getByText('已撤销对应操作。').waitFor(); assert.equal((await service.execute('search_words', { query: 'retain' })).words[0].add_count, 1);
  });
  await check('library immediate filters, no result state and keyboard access', async () => { await ui.getByRole('searchbox').fill('nonexistentword'); await ui.getByText('暂时没有匹配的词').waitFor(); await ui.getByRole('searchbox').fill(''); await ui.getByRole('combobox', { name: '加入时间' }).click(); await ui.getByRole('option', { name: '今天', exact: true }).click(); await ui.getByRole('combobox', { name: 'retain 熟练度', exact: true }).waitFor(); });
  await check('offline save failure keeps input and lets user recover', async () => {
    harness.setOffline(true); await ui.getByRole('button', { name: '＋ 加入单词' }).click(); await ui.getByRole('textbox', { name: '输入或粘贴单词' }).fill('evidence'); await ui.getByRole('button', { name: '检查并确认' }).click(); await ui.getByText('词库服务不可达。输入已保留，请稍后重试。').last().waitFor(); assert.equal(await ui.getByRole('textbox', { name: '输入或粘贴单词' }).inputValue(), 'evidence');
    harness.setOffline('transport'); await ui.getByRole('button', { name: '检查并确认' }).click(); await ui.getByText('词库服务暂时不可达，尚未确认的操作没有显示为已保存。输入和当前页面已保留；服务恢复后点“重新连接”再试。').first().waitFor(); await ui.locator('header').getByText('词库暂不可达', { exact: true }).waitFor(); assert.equal(await ui.getByRole('textbox', { name: '输入或粘贴单词' }).inputValue(), 'evidence');
    harness.setOffline(false); const modalReconnect = ui.getByRole('dialog', { name: '加入今天的词' }).getByRole('button', { name: '重新连接词库' }); await expect(modalReconnect).toBeEnabled(); await modalReconnect.click(); await ui.getByText('已重新连接并读取保存数据。').waitFor(); await ui.getByText('词库已连接', { exact: true }).waitFor(); await ui.getByRole('button', { name: '关闭单词导入' }).click();
  });
  await check('image import reports unsupported host upload and never pretends recognition occurred', async () => {
    const before = (await service.execute('list_words')).words.length; await ui.getByRole('button', { name: '＋ 加入单词' }).click();
    await ui.locator('input[type="file"]').setInputFiles({ name: 'vocabulary.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lfoAAAAASUVORK5CYII=', 'base64') });
    await ui.getByText('此宿主尚未提供图片上传接口。请在 ChatGPT 聊天中附上图片并说“识别这些词，交给 Vocabulary Context 确认”。识别后会回到确认界面。').first().waitFor();
    assert.equal((await service.execute('list_words')).words.length, before); await ui.getByRole('button', { name: '关闭单词导入' }).click();
  });
  await check('today prioritized, old words selected programmatically and reroll preserves fixed words', async () => {
    clock = '2026-10-01T04:00:00Z'; let batch = await direct('add_words', { text: 'resilient ambiguous sustain credible durable adapt negotiate' }); await direct('confirm_import', { import_id: batch.import_id, items: batch.items }); clock = '2026-10-14T04:00:00Z';
    await ui.getByRole('button', { name: '选择目标词', exact: true }).click(); await ui.getByRole('heading', { name: '阅读，从这组词开始' }).waitFor();
    const before = (await service.execute('get_selection')).selection; assert.equal(before.words.filter(w => w.sources.includes('today')).length, 5); assert.equal(before.words.filter(w => w.sources.includes('auto')).length, 4);
    await ui.getByRole('button', { name: '换一批旧词' }).click(); await ui.getByText('已更换可替换的旧词；今日词和手动必选词保留。').waitFor(); const after = (await service.execute('get_selection')).selection; assert.deepEqual(after.words.filter(w => w.sources.includes('today')).map(w => w.id), before.words.filter(w => w.sources.includes('today')).map(w => w.id));
    await page.screenshot({ path: path.join(output, 'selection-tablet.png') });
  });
  await check('conversation preparation independent of reading; context handoff, no fake usage', async () => {
    const messagesBefore=harness.messages.length;
    await ui.getByRole('button', { name: '英语交流', exact: true }).click(); await ui.getByRole('button', { name: '开始交流', exact: true }).click(); await ui.getByText('准备好了，可以开始交流', { exact: true }).waitFor();
    assert.ok((await service.execute('list_words')).words.every(w => w.conversation_count === 0));
    assert.equal(harness.messages.length,messagesBefore);const prepared=await page.evaluate(()=>window.modelContexts.at(-1).structuredContent.vocabulary_conversation);assert.ok(prepared.conversation_id&&prepared.words.length);assert.match(prepared.instructions,/preparation only/);
    await page.screenshot({ path: path.join(output, 'conversation-desktop.png') });
  });
  await check('real generation handoff preserves pending state until actual saved article', async () => {
    await ui.getByRole('button', { name: '词库', exact: true }).click(); await ui.getByRole('spinbutton').fill('0'); await ui.getByRole('button', { name: '选择目标词', exact: true }).click(); await ui.getByLabel('篇幅', { exact: true }).selectOption('short');
    await ui.getByRole('button', { name: '用这组词生成文章' }).click(); await ui.getByRole('button', { name: '等待 ChatGPT 完成文章…' }).waitFor(); assert.equal((await service.execute('list_articles')).articles.length, 0); assert.ok(harness.messages.at(-1).content[0].text.includes('save_article'));
  });
  // Original development model-written article and occurrence glosses are not an app fallback.
  const { buildReviewDraft } = await import('./fixtures/review-draft.mjs');
  const prepared = calls.filter(x => x.name === 'prepare_article').at(-1); const generations = service.repository.objects('generation'); const generation = generations.at(-1); assert.ok(prepared && generation);
  const draft = await buildReviewDraft(service); const validated = await service.execute('validate_article', { generation_id: generation.id, draft }); assert.equal(validated.valid, true, JSON.stringify(validated.errors));
  const { article } = await direct('save_article', { generation_id: generation.id, draft });
  await page.evaluate(value => window.sendToolResult({ structuredContent: { article: value }, content: [] }), article);
  await ui.locator('.prose').waitFor();
  await check('saved original article occurrence mappings, lookup without tool/model requests, Esc/focus/scroll stable', async () => {
    await page.waitForTimeout(1400); // Settle article persistence/filter effects before measuring lookup itself.
    const trigger = ui.locator('.word').filter({ hasText: /^compelling$/i }).first(); const before = calls.length, messagesBefore = harness.messages.length;
    const articlePane = ui.locator('.article-pane'); await trigger.click(); await ui.getByRole('heading', { name: 'compelling', exact: true }).waitFor();
    assert.equal(calls.length, before); assert.equal(harness.messages.length, messagesBefore);
    const scroll = await articlePane.evaluate(el => el.scrollTop); const top = await trigger.evaluate(el => el.getBoundingClientRect().top); await trigger.press('Escape'); assert.ok(await trigger.evaluate(el => el === document.activeElement)); assert.equal(await articlePane.evaluate(el => el.scrollTop), scroll); assert.equal(await trigger.evaluate(el => el.getBoundingClientRect().top), top);
    const paneDocumentTop = await articlePane.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
    const proseOffset = await trigger.evaluate(el => el.getBoundingClientRect().top - el.closest('.article-pane').getBoundingClientRect().top);
    await trigger.click(); await ui.getByRole('button', { name: '有点印象', exact: true }).click(); await ui.getByText('“compelling”已保存为 Lv.3。').waitFor(); assert.equal((await service.execute('search_words', { query: 'compelling' })).words[0].familiarity_level, 2);
    assert.equal(await articlePane.evaluate(el => el.scrollTop), scroll); assert.equal(await articlePane.evaluate(el => el.getBoundingClientRect().top + window.scrollY), paneDocumentTop, 'feedback must not reflow the reader'); assert.equal(await trigger.evaluate(el => el.getBoundingClientRect().top - el.closest('.article-pane').getBoundingClientRect().top), proseOffset);
    await ui.getByRole('button', { name: '撤销上次操作' }).click(); await ui.getByText('已撤销对应操作。').waitFor();
    assert.equal(await articlePane.evaluate(el => el.scrollTop), scroll); assert.equal(await articlePane.evaluate(el => el.getBoundingClientRect().top + window.scrollY), paneDocumentTop, 'undo must not reflow the reader'); assert.equal(await trigger.evaluate(el => el.getBoundingClientRect().top - el.closest('.article-pane').getBoundingClientRect().top), proseOffset);
  });
  await check('desktop/tablet actual layouts and narrow host containers without horizontal overflow', async () => {
    for (const [width, height] of [[1024, 768], [1180, 820], [1366, 768], [1440, 900], [600, 820], [320, 820]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(100); await noOverflow(ui);
      const prose = await ui.locator('.prose').boundingBox(); assert.ok(prose.width < 850); await page.screenshot({ path: path.join(output, `reading-${width}.png`) });
    }
  });
  await check('rotation/container change keeps selected definition and reading position; theme switches', async () => {
    await page.setViewportSize({ width: 1180, height: 820 }); await ui.locator('.article-pane').evaluate(el => { el.scrollTop = 180; }); await ui.locator('.word').filter({ hasText: /^retain$/i }).first().click(); const savedScroll = await ui.locator('.article-pane').evaluate(el => el.scrollTop);
    await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(120); assert.equal(await ui.locator('.article-pane').evaluate(el => el.scrollTop), savedScroll); await ui.getByRole('heading', { name: 'retain', exact: true }).waitFor();
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.setTheme('dark')); await ui.locator('html[data-theme="dark"]').waitFor(); await noOverflow(ui); await page.screenshot({ path: path.join(output, 'reading-dark-desktop.png') }); await page.evaluate(() => window.setTheme('light'));
  });
  await check('history reopening and host component recreation restore article state', async () => { await ui.getByRole('button', { name: '历史文章', exact: true }).click(); await ui.getByRole('heading', { name: article.title, exact: true }).waitFor(); await ui.getByRole('button', { name: new RegExp(article.title) }).click(); await ui.locator('.prose').waitFor(); await page.waitForTimeout(1200); ui = await connected(page); await ui.locator('.prose').waitFor(); assert.equal(await ui.locator('.article-pane h1').textContent(), article.title); });
  await check('initial host article wins over older reading preferences during delayed workspace hydration', async () => {
    const freshTask = (await direct('prepare_article', { selection_id: generation.selection_id, config: generation.config })).generation;
    const freshArticle = (await direct('save_article', { generation_id: freshTask.id, draft: { ...draft, title: 'Fresh host article must win' } })).article;
    await direct('save_preferences', { preferences: { selected_lesson: article.lesson_id, page: 'read', generation: null } });
    let release; workspaceGate = new Promise(resolve => { release = resolve; }); const requested = new Promise(resolve => { workspaceObserved = resolve; });
    const racePage = await context.newPage();
    try {
      await racePage.goto(harness.url); await requested;
      await racePage.evaluate(value => window.sendToolResult({ structuredContent: { article: value }, content: [] }), freshArticle);
      const raceUi = racePage.frameLocator('#app'); await raceUi.getByRole('heading', { name: freshArticle.title, exact: true }).waitFor();
      release(); workspaceGate = null; workspaceObserved = null;
      await raceUi.getByText('词库已连接', { exact: true }).waitFor(); await racePage.waitForTimeout(1500);
      assert.equal(await raceUi.locator('.article-pane h1').textContent(), freshArticle.title);
      assert.equal((await service.execute('get_preferences')).preferences.selected_lesson, freshArticle.lesson_id);
    } finally { release(); workspaceGate = null; workspaceObserved = null; await racePage.close(); }
    await direct('save_preferences', { preferences: { selected_lesson: article.lesson_id, page: 'read', generation: null } });
  });
  await check('every task remains reachable in narrow host containers; import form does not overflow', async () => {
    for (const width of [600, 320]) {
      await page.setViewportSize({ width, height: 820 });
      for (const task of ['词库', '目标词与阅读', '英语交流', '历史文章']) { await ui.getByRole('button', { name: task, exact: true }).click(); await noOverflow(ui); }
      await ui.getByRole('button', { name: '词库', exact: true }).click(); await ui.getByRole('button', { name: '＋ 加入单词' }).click(); if (!await ui.getByRole('textbox', { name: '输入或粘贴单词' }).count()) await ui.getByRole('button', { name: '重新输入' }).click(); await ui.getByRole('textbox', { name: '输入或粘贴单词' }).fill('evidence\nretain'); await ui.getByRole('button', { name: '检查并确认' }).click(); await ui.getByRole('button', { name: '确认加入 2 个词' }).waitFor(); await noOverflow(ui); await ui.getByRole('button', { name: '关闭单词导入' }).click();
    }
    await page.setViewportSize({ width: 1180, height: 820 }); await ui.getByRole('button', { name: '历史文章', exact: true }).click(); await ui.getByRole('button', { name: new RegExp(article.title) }).click(); await page.waitForTimeout(1200);
  });
  const touchContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false }); const touchPage = await touchContext.newPage(); touchPage.on('pageerror', e => errors.push(e.message)); const touchUi = await connected(touchPage);
  await check('tablet coarse pointer touch: change definition directly, comfortable controls, saved shared store', async () => {
    await touchUi.locator('.prose').waitFor(); await touchUi.locator('.word').filter({ hasText: /^compelling$/i }).first().tap(); await touchUi.getByRole('heading', { name: 'compelling', exact: true }).waitFor(); await touchUi.locator('.word').filter({ hasText: /^retain$/i }).first().tap(); await touchUi.getByRole('heading', { name: 'retain', exact: true }).waitFor(); const button = await touchUi.getByRole('button', { name: '关闭释义并返回所选词' }).boundingBox(); assert.ok(button.width >= 44 && button.height >= 44); await noOverflow(touchUi); await touchPage.screenshot({ path: path.join(output, 'reading-touch-tablet.png') });
  });
  await check('two separate browser contexts share real word additions and tablet feedback; no localhost/tablet claim', async () => {
    await touchUi.getByRole('button', { name: '有点印象', exact: true }).tap(); await touchUi.getByText('“retain”已保存为 Lv.3。').waitFor();
    ui = await connected(page); await ui.getByRole('button', { name: '词库', exact: true }).click(); assert.equal(await ui.getByRole('combobox', { name: 'retain 熟练度', exact: true }).inputValue(), '2'); assert.equal((await service.execute('list_words')).words.length, 12);
  });
  await check('stale cross-device feedback rejected, refreshed and only saved after user reconfirms', async () => {
    const word = (await service.execute('search_words', { query: 'retain' })).words[0];
    await direct('update_familiarity', { word_id: word.id, expected_version: word.version, level: 4 });
    await touchUi.getByRole('button', { name: '有点印象', exact: true }).tap();
    await touchUi.getByText(/已重新读取当前数据，请确认等级后再操作/).waitFor();
    assert.equal((await service.execute('search_words', { query: 'retain' })).words[0].familiarity_level, 4);
    await touchUi.getByRole('button', { name: '有点印象', exact: true }).tap(); await touchUi.getByText('“retain”已保存为 Lv.3。').waitFor();
    assert.equal((await service.execute('search_words', { query: 'retain' })).words[0].familiarity_level, 2);
  });
  await check('high load has actionable frozen split plan, preserves entire set, host handoff never claims unsaved completion', async () => {
    const wordIds = (await service.execute('list_words')).words.map(word => word.id);
    const { selection } = await direct('select_target_words', { mode: 'manual', manual_ids: wordIds });
    ui = await connected(page); await ui.getByRole('button', { name: '目标词与阅读', exact: true }).click(); await ui.getByLabel('篇幅', { exact: true }).selectOption('short');
    await ui.getByRole('button', { name: '分为多篇生成', exact: true }).waitFor(); await ui.getByRole('button', { name: '分为多篇生成', exact: true }).click();
    await ui.getByText(/全部实际保存后才确认整组完成/).waitFor();
    const plan = service.repository.objects('split_plan').at(-1); assert.ok(plan.parts.length >= 2); assert.deepEqual(new Set(plan.parts.flatMap(part => part.words.map(word => word.id))), new Set(wordIds)); assert.equal((await service.execute('get_selection')).selection.id, selection.id);
    assert.ok(plan.parts.every(part => harness.messages.at(-1).content[0].text.includes(part.id)));
    for (const part of plan.parts) assert.equal((await service.execute('get_generation', { generation_id: part.id })).status, 'prepared');
    assert.equal((await service.execute('list_articles')).articles.length, 2, 'the original article and the race-test article remain saved; split parts are only prepared'); await ui.getByText(/分篇计划：已保存 0/).waitFor(); await page.screenshot({ path: path.join(output, 'split-plan-tablet.png') });
    await ui.getByRole('button', { name: '暂时停止检查' }).click();
  });
  assert.deepEqual(errors, []);
  await writeFile('test-results/ui-summary.json', JSON.stringify({ environment: 'Chrome local standard MCP Apps bridge harness; NOT ChatGPT desktop/tablet', productionGenerationProven: false, originalReviewFixture: true, checks, consoleErrors: errors, sizes: ['1024×768 touch', '1180×820', '1366×768', '1440×900', '600px host', '320px host', '820×1180 rotation'], screenshots: output }, null, 2));
  console.log(`${checks.length} UI checks passed; previews in docs/previews. This is not a ChatGPT host verification.`);
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'ui-failure.png') }).catch(() => {});
  await writeFile('test-results/ui-summary.json', JSON.stringify({ environment: 'local MCP Apps bridge harness', checks, consoleErrors: errors, recentCalls: calls.slice(-8), failure: error.stack }, null, 2)); throw error;
} finally { await browser?.close(); await harness.close(); service.close(); await rm(dataDir, { recursive: true, force: true }); }
