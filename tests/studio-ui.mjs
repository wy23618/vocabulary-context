// Selection sidebar, theme preservation and compact-host layout regression.
// Uses an isolated SQLite library, never production learning data.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';

const dataDir = await mkdtemp(path.join(tmpdir(), 'elis-studio-'));
const service = createService({ dataDir });
const call = (name, args = {}) => service.execute(name, { ...args, request_id: randomUUID() });
const batch = await call('add_words', { text: Array.from({ length: 40 }, (_, i) => `sample${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`).join(' ') });
const added = await call('confirm_import', { import_id: batch.import_id, items: batch.items });
await call('select_target_words', { mode: 'manual', manual_ids: added.words.slice(0, 24).map(word => word.id) });
const harness = await startHarness(service);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 854 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(harness.url);
  const ui = page.frameLocator('#app');
  await ui.getByText('词库已连接', { exact: true }).waitFor();
  const sidebar = ui.getByRole('complementary', { name: '本次练习' });
  await expect(sidebar.locator('.session-word')).toHaveCount(24);
  const list = sidebar.locator('.session-word-list');
  assert.ok(await list.evaluate(node => node.scrollHeight > node.clientHeight), 'Long selections scroll inside the sidebar');
  const lastRemove = sidebar.locator('.session-word').last().getByRole('button');
  const removedName = await sidebar.locator('.session-word').last().locator('strong').textContent();
  await lastRemove.scrollIntoViewIfNeeded();
  await expect(lastRemove).toBeInViewport();
  await lastRemove.click();
  await expect(sidebar.locator('.session-word')).toHaveCount(23);
  await expect.poll(async () => (await call('get_selection')).selection.words.length).toBe(23);
  assert.ok(!(await call('get_selection')).selection.words.some(word => word.word === removedName));
  await page.reload(); await ui.getByText('词库已连接', { exact: true }).waitFor();
  await expect(sidebar.locator('.session-word')).toHaveCount(23);
  assert.deepEqual((await call('list_words')).words.map(word => [word.id, word.familiarity_level, word.version]).sort(), added.words.map(word => [word.id, word.familiarity_level, word.version]).sort(), 'Changing the session leaves vocabulary and levels intact');

  const colors = () => ui.locator('html').evaluate(node => {
    const style = getComputedStyle(node);
    return ['--page', '--surface', '--primary-strong', '--soft'].map(key => style.getPropertyValue(key).trim());
  });
  assert.deepEqual(await colors(), ['#f3f5f1', '#fffefa', '#315b46', '#eaf0e8']);
  await ui.getByRole('button', { name: '学习设置', exact: true }).click();
  await ui.getByRole('dialog').getByRole('button', { name: '深色', exact: true }).click();
  assert.deepEqual(await colors(), ['#18221d', '#223129', '#acd5b9', '#2b4033']);
  assert.equal(await ui.locator('.library-heading>.primary').evaluate(node => getComputedStyle(node).color), 'rgb(172, 213, 185)', 'The secondary import button remains readable in dark mode');
  await ui.getByRole('dialog').getByRole('button', { name: '关闭设置', exact: true }).click();

  for (const [width, height] of [[1360, 900], [820, 854], [600, 854], [390, 844], [320, 740], [844, 390], [568, 320]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => ui.locator('.app-shell').evaluate(node => Math.round(node.getBoundingClientRect().height))).toBe(height - 22);
    const dimensions = await ui.locator('html').evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight }));
    assert.ok(dimensions.scroll <= dimensions.width + 1 && dimensions.scrollHeight <= dimensions.height + 1, `No outer clipping at ${width}×${height}`);
    await expect(sidebar.getByRole('button', { name: '开始阅读', exact: true })).toBeInViewport();
    await expect(sidebar.getByRole('button', { name: '开始交流', exact: true })).toBeInViewport();
    const panel = await ui.locator('.library-main').boundingBox();
    const dock = await sidebar.boundingBox();
    if (width > 760 && height > 480) {
      assert.ok(dock.x >= panel.x + panel.width, 'Wide layouts separate browsing and the current session');
    } else {
      assert.ok(dock.y >= panel.y + panel.height, 'Compact layouts keep actions below the word list');
    }
    if (height > 480) await expect(ui.getByRole('checkbox', { name: '反复遗忘', exact: true })).toBeVisible();
  }
  assert.deepEqual(errors, []);
  console.log('Studio UI verified: original light/dark palette, long selection scrolling/removal/reload, unchanged word levels and reachable actions in 7 viewport sizes.');
} finally {
  await browser.close(); await harness.close(); service.close(); await rm(dataDir, { recursive: true, force: true });
}
