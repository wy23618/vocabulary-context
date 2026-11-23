import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'elis-topic-'));
const service = createService({ dataDir: directory });
const call = (name, args = {}) => service.execute(name, { ...args, request_id: randomUUID() });
const harness = await startHarness(service);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const batch = await call('add_words', { text: 'retain' });
  const added = await call('confirm_import', { import_id: batch.import_id, items: batch.items });
  const selection = (await call('select_target_words', { mode: 'manual', manual_ids: added.words.map(word => word.id), auto_count: 0 })).selection;
  const page = await browser.newPage();
  await page.goto(harness.url);
  const ui = page.frameLocator('#app');
  await ui.getByRole('button', { name: '阅读', exact: true }).click();
  const topic = ui.getByRole('textbox', { name: '主题', exact: true });
  await expect(topic).toHaveValue('');
  await expect(ui.getByRole('button', { name: '生成阅读', exact: true })).toBeDisabled();
  await topic.fill('城市与公共交通');
  await ui.getByRole('button', { name: '生成阅读', exact: true }).click();
  await expect.poll(() => harness.messages.length).toBe(1);
  const first = service.repository.objects('generation').at(-1);
  assert.equal(first.config.topic, '城市与公共交通');
  await ui.getByRole('button', { name: '暂时停止检查', exact: true }).click();
  await expect(ui.getByRole('button', { name: '继续完成已准备的文章', exact: true })).toBeVisible();
  await topic.fill('海洋保护');
  await expect(ui.getByRole('button', { name: '生成阅读', exact: true })).toBeEnabled();
  await expect(ui.getByRole('button', { name: '继续完成已准备的文章', exact: true })).toHaveCount(0);
  await expect(ui.locator('.pending-task')).toHaveCount(0);
  // Reopening may return the old prepared task; it must not override the edited topic.
  await expect.poll(async () => (await call('get_preferences')).preferences.config?.topic).toBe('海洋保护');
  await page.reload();
  await expect(topic).toHaveValue('海洋保护');
  await expect(ui.getByRole('button', { name: '生成阅读', exact: true })).toBeEnabled();
  await ui.getByRole('button', { name: '生成阅读', exact: true }).click();
  await expect.poll(() => harness.messages.length).toBe(2);
  const second = service.repository.objects('generation').find(task => task.id !== first.id);
  assert.notEqual(first.id, second.id);
  assert.equal(second.config.topic, '海洋保护');
  assert.match(harness.messages[1].content[0].text, /海洋保护/);
  assert.equal(service.repository.objects('generation').length, 2);
  await expect(ui.getByRole('button', { name: '等待 ChatGPT 完成文章…', exact: true })).toBeVisible();
  // A late result from the old topic is kept in history without replacing the editor.
  await page.evaluate(article => window.sendToolResult({ structuredContent: { article } }), {
    lesson_id: 'old-task-test-result', title: '旧主题测试结果', topic: first.config.topic,
    config: first.config, target_words: first.words, article: 'Test only.', word_map: [],
    created_at: new Date().toISOString(), word_count: 2,
  });
  await expect(topic).toBeVisible();
  await expect(topic).toHaveValue('海洋保护');
  // Changes during polling must unlock a new request, including a blank topic.
  await ui.getByRole('combobox', { name: '篇幅', exact: true }).selectOption('short');
  await expect(ui.getByRole('button', { name: '生成阅读', exact: true })).toBeEnabled();
  await expect(ui.locator('.pending-task')).toHaveCount(0);
  await ui.getByRole('button', { name: '生成阅读', exact: true }).click();
  await expect.poll(() => harness.messages.length).toBe(3);
  await topic.fill('');
  await expect(ui.getByRole('button', { name: '生成阅读', exact: true })).toBeDisabled();
  await topic.fill('生物多样性');
  await ui.getByRole('button', { name: '生成阅读', exact: true }).click();
  await expect.poll(() => harness.messages.length).toBe(4);
  await ui.getByRole('button', { name: '词库', exact: true }).click();
  await ui.locator('.word-row').getByRole('checkbox').uncheck();
  await expect(ui.locator('.session-dock').getByRole('button', { name: '开始阅读', exact: true })).toBeDisabled();
  await ui.locator('.word-row').getByRole('checkbox').check();
  await ui.getByRole('button', { name: '阅读', exact: true }).click();
  await expect(ui.getByRole('button', { name: '生成阅读', exact: true })).toBeEnabled();
  await ui.getByRole('combobox', { name: '篇幅', exact: true }).selectOption('custom');
  await ui.getByRole('button', { name: '生成阅读', exact: true }).click();
  await expect.poll(() => harness.messages.length).toBe(5);
  const custom = service.repository.objects('generation').find(task => task.config.length === 'custom');
  assert.equal(custom.config.min_words, 350);
  assert.equal(custom.config.max_words, 500);
  await ui.getByRole('button', { name: '暂时停止检查', exact: true }).click();
  // A restored split plan also stops resuming when settings change.
  const plan = (await call('prepare_split_articles', { selection_id: selection.id, config: { topic: '生物多样性', length: 'short' } })).plan;
  await call('save_preferences', { preferences: { generation: null, split_plan: plan, page: 'practice', config: plan.parts[0].config } });
  await page.reload();
  await expect(ui.getByRole('button', { name: '继续请求未完成的分篇', exact: true })).toBeVisible();
  await ui.getByRole('combobox', { name: '篇幅', exact: true }).selectOption('long');
  await expect(ui.getByRole('button', { name: '继续请求未完成的分篇', exact: true })).toHaveCount(0);
  await expect(ui.getByRole('button', { name: '生成阅读', exact: true })).toBeEnabled();
  console.log('Verified: empty initial topic; changed topic clears resume state, survives reload, and creates a distinct task with the new topic.');
} finally {
  await browser.close(); await harness.close(); service.close();
  await rm(directory, { recursive: true, force: true });
}


