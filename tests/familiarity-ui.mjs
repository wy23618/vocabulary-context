// Real browser + MCP Apps bridge + disposable SQLite; not a Work host certification.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createService } from '../server/service.mjs';
import { startHarness } from './harness.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'elis-familiarity-'));
const service = createService({ dataDir });
const direct = (name, args = {}) => service.execute(name, { ...args, request_id: randomUUID() });
const staged = await direct('add_words', { text: 'retain evidence sustain adapt knowledge conventional' });
await direct('confirm_import', { import_id: staged.import_id, items: staged.items });
const calls = [];
const harness = await startHarness({ execute: async (name, args) => { calls.push({ name, args }); return service.execute(name, args); } });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1050, height: 700 } });
  await page.goto(harness.url);
  const ui = page.frameLocator('#app');
  await ui.getByText('词库已连接', { exact: true }).waitFor();
  const control = ui.getByRole('combobox', { name: 'retain 熟练度', exact: true });
  await expect(control).toBeEnabled();
  await control.scrollIntoViewIfNeeded();
  const before = await control.evaluate(el => {
    el.dataset.familiarityProbe = 'same-control';
    return { top: el.getBoundingClientRect().top, scroll: [...document.querySelectorAll('*')].filter(x => x.scrollTop).map(x => [x.className, x.scrollTop]) };
  });
  await control.selectOption('4');
  await ui.getByText('已保存。', { exact: true }).waitFor();
  await expect(control).toHaveValue('4');
  const saved = (await service.execute('list_words', { query: 'retain' })).words[0];
  assert.equal(saved.familiarity_level, 4);
  const updates = calls.filter(x => x.name === 'update_familiarity');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].args.expected_version, saved.version - 1);
  assert.ok(updates[0].args.request_id);
  assert.equal(harness.messages.length, 0);
  assert.equal(await page.evaluate(() => window.messages.length), 0);
  const after = await control.evaluate(el => ({ same: el.dataset.familiarityProbe, top: el.getBoundingClientRect().top, scroll: [...document.querySelectorAll('*')].filter(x => x.scrollTop).map(x => [x.className, x.scrollTop]) }));
  assert.equal(after.same, 'same-control');
  assert.equal(after.top, before.top);
  assert.deepEqual(after.scroll, before.scroll);
  const peer = createService({ dataDir });
  try { assert.equal((await peer.execute('list_words', { query: 'retain' })).words[0].familiarity_level, 4); }
  finally { peer.close(); }
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/familiarity-inline.png' });
  await page.reload();
  await ui.getByText('词库已连接', { exact: true }).waitFor();
  await expect(ui.getByRole('combobox', { name: 'retain 熟练度', exact: true })).toHaveValue('4');
  assert.equal(harness.messages.length, 0);
  console.log('PASS: retain → 4; one tool call; persisted across DB connection and reload; same DOM control and scroll; zero chat messages.');
} finally {
  await browser?.close();
  await harness.close();
  service.close();
}
