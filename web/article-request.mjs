export function readingConfigKey(config = {}) {
  const length = config.length ?? 'standard';
  const range = { short: [200, 300], standard: [350, 500], long: [550, 750] }[length]
    ?? [Number(config.min_words ?? 350), Number(config.max_words ?? 500)];
  return JSON.stringify([String(config.topic ?? '').trim(), length, ...range,
    config.difficulty ?? 'standard', config.syntax ?? 'standard']);
}
export function matchesReadingRequest(task, config, ids) {
  if (!task || readingConfigKey(task.config) !== readingConfigKey(config)) return false;
  const words = task.words ?? task.target_words ?? [];
  const frozen = new Set(words.map(word => word.id));
  return frozen.size === ids.length && ids.every(id => frozen.has(id));
}
export function matchesReadingPlan(plan, config, ids) {
  if (!plan?.parts?.length) return false;
  const frozen = new Set(plan.word_ids);
  return frozen.size === ids.length && ids.every(id => frozen.has(id))
    && plan.parts.every(part => readingConfigKey(part.config) === readingConfigKey(config));
}
