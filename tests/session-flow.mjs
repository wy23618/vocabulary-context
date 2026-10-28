import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'elis-session-'));
const service = createService({ dataDir: directory });
const call = (name, args = {}) => service.execute(name, { ...args, request_id: randomUUID() });
let slow = true, loseAck = false;
const harness = await startHarness({ execute: async (name, args) => {
  if (name === 'select_target_words' && slow) await new Promise(resolve => setTimeout(resolve, 350));
  const result = await service.execute(name, args);
  if (name === 'select_target_words' && loseAck) { loseAck = false; throw new Error('Simulated lost acknowledgement after commit'); }
  return result;
}});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const batch = await call('add_words', { text: 'compelling retain diminish impose conventional' });
  const added = await call('confirm_import', { import_id: batch.import_id, items: batch.items });
  await call('save_preferences', { preferences: { config: { topic: '学习与记忆', length: 'short', difficulty: 'standard', syntax: 'standard' } } });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(harness.url);
  const ui = page.frameLocator('#app');
  await expect(ui.locator('.session-dock').getByRole('button', { name: '开始交流', exact: true })).toBeEnabled();
  await expect(ui.getByRole('button', { name: '准备词组 →', exact: true })).toHaveCount(0);
  await expect(ui.getByRole('button', { name: '选择目标词', exact: true })).toHaveCount(0);
  await expect(ui.locator('.selection-builder')).toHaveCount(0);
  const row = word => ui.locator('.word-row').filter({ has: ui.locator('strong').getByText(word, { exact: true }) });
  await row('compelling').getByRole('checkbox').check();
  await row('retain').getByRole('checkbox').check();
  await row('compelling').getByRole('checkbox').uncheck();
  await expect(row('retain').getByRole('checkbox')).toBeChecked();
  await ui.locator('.session-dock').getByRole('button', { name: '开始阅读', exact: true }).click();
  await expect(ui.getByRole('button', { name: '等待 ChatGPT 完成文章…', exact: true })).toBeVisible();
  const generation = service.repository.objects('generation').at(-1);
  assert.deepEqual(generation.words.map(word => word.word), ['retain']);
  assert.match(harness.messages.at(-1).content[0].text, /save_article/);
  assert.equal(harness.messages.length, 1);
  assert.equal(service.repository.objects('article').length, 0);
  assert.ok((await call('list_words')).words.every(word => word.conversation_count === 0 && word.article_count === 0));
  await ui.getByRole('button', { name: '暂时停止检查', exact: true }).click();
  await ui.getByRole('button', { name: '词库', exact: true }).click();
  await ui.locator('.session-dock').getByRole('button', { name: '开始交流', exact: true }).click();
  await expect(ui.locator('.voice-ready')).toBeVisible();
  const conversation = service.repository.objects('conversation').at(-1);
  assert.deepEqual(conversation.words.map(word => word.word), ['retain']);
  assert.equal(harness.messages.length, 2);

  // A failed response after a real server commit must not silently resurrect a check.
  await ui.getByRole('button', { name: '词库', exact: true }).click();
  slow = false; loseAck = true;
  await row('impose').getByRole('checkbox').check();
  await expect(ui.getByRole('button', { name: '重试同步选词', exact: true })).toBeVisible();
  await expect(row('impose').getByRole('checkbox')).toBeChecked();
  await row('impose').getByRole('checkbox').uncheck();
  await expect.poll(async () => (await call('get_selection')).selection.words.map(word => word.word)).toEqual(['retain']);
  await expect(ui.getByRole('button', { name: '重试同步选词', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(row('retain').getByRole('checkbox')).toBeChecked();
  await expect(row('impose').getByRole('checkbox')).not.toBeChecked();
  await ui.getByRole('button', { name: '只看已选单词', exact: true }).click();
  await expect(ui.locator('.word-row')).toHaveCount(1);
  await expect(row('retain')).toBeVisible();
  await ui.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(ui.locator('.word-row')).toHaveCount(5);

  // New typed words use one save; a repeated word still explains its level change.
  await ui.getByRole('button', { name: '＋ 录入新词', exact: true }).click();
  await ui.getByRole('textbox', { name: '输入或粘贴单词', exact: true }).fill('resilient');
  await ui.getByRole('button', { name: '保存到词库', exact: true }).click();
  await expect(ui.getByRole('dialog')).toHaveCount(0);
  assert.equal((await call('search_words', { query: 'resilient' })).words.length, 1);
  await expect(row('resilient').getByRole('checkbox')).not.toBeChecked();
  await ui.getByRole('button', { name: '＋ 录入新词', exact: true }).click();
  await ui.getByRole('textbox', { name: '输入或粘贴单词', exact: true }).fill('retain');
  await ui.getByRole('button', { name: '保存到词库', exact: true }).click();
  await expect(ui.getByRole('heading', { name: '核对重复词或识别结果', exact: true })).toBeVisible();
  await ui.getByRole('button', { name: '关闭单词导入', exact: true }).click();

  const output = 'docs/previews/flow'; await mkdir(output, { recursive: true });
  for (const [width, height] of [[320, 740], [390, 844], [600, 854], [820, 1180], [1180, 820], [844, 390], [568, 320]]) {
    await page.setViewportSize({ width, height });
    await ui.getByRole('button', { name: '词库', exact: true }).click();
    await expect(ui.locator('.session-dock').getByRole('button', { name: '开始交流', exact: true })).toBeInViewport();
    await expect(ui.locator('.session-dock').getByRole('button', { name: /开始阅读|继续上次写作/ })).toBeInViewport();
    assert.ok(await ui.locator('.word-list').evaluate(node => node.getBoundingClientRect().height > 60));
    const dimensions = await ui.locator('html').evaluate(node => [node.scrollWidth - node.clientWidth, node.scrollHeight - node.clientHeight]);
    assert.ok(dimensions.every(difference => difference <= 1));
    if ([390, 1180, 568].includes(width)) await page.screenshot({ animations: 'disabled', path: `${output}/library-${width}.png` });
    await ui.getByRole('button', { name: '英语交流', exact: true }).click();
    await ui.getByRole('button', { name: /^(开始交流|重新发送本次话题)$/ }).scrollIntoViewIfNeeded();
    if ([390, 1180].includes(width)) await page.screenshot({ animations: 'disabled', path: `${output}/conversation-${width}.png` });
  }
  assert.equal(added.words.length, 5);
  assert.deepEqual(errors, []);
  console.log('Direct session flow verified: checkbox → reading/chat with no builder or confirmation, latest-write ordering, lost-ack recovery, reload, one-step new-word entry and reachable actions in 7 orientations.');
} finally { await browser.close(); await harness.close(); service.close(); await rm(directory, { recursive: true, force: true }); }
