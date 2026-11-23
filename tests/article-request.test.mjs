import test from 'node:test';
import assert from 'node:assert/strict';
import { readingConfigKey, matchesReadingRequest, matchesReadingPlan } from '../web/article-request.mjs';

test('resume uses effective settings and the exact word set', () => {
  const config = { topic: '海洋保护', length: 'short' };
  const task = { config: { ...config, min_words: 200, max_words: 300, difficulty: 'standard', syntax: 'standard' }, words: [{ id: 'a' }, { id: 'b' }] };
  assert.ok(matchesReadingRequest(task, config, ['b', 'a']));
  assert.equal(readingConfigKey(config), readingConfigKey({ ...task.config, topic: ' 海洋保护 ' }));
  for (const change of [{ topic: '教育' }, { length: 'long' }, { difficulty: 'hard' }, { syntax: 'intensive' }, { length: 'custom', min_words: 201, max_words: 300 }]) {
    assert.equal(matchesReadingRequest(task, { ...config, ...change }, ['a', 'b']), false);
  }
  assert.equal(matchesReadingRequest(task, config, ['a']), false);
  assert.equal(matchesReadingRequest(task, config, ['a', 'c']), false);
  assert.ok(matchesReadingRequest(task, { ...config, min_words: 999 }, ['a', 'b']), 'inactive custom bounds do not invalidate standard presets');
  const plan = { word_ids: ['a', 'b'], parts: [task] };
  assert.ok(matchesReadingPlan(plan, config, ['a', 'b']));
  assert.equal(matchesReadingPlan(plan, { ...config, topic: '城市' }, ['a', 'b']), false);
  assert.equal(matchesReadingPlan(plan, config, ['a']), false);
});
