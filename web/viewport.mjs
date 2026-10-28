// An inline host frame may start as a tiny placeholder. Its current height is
// not the content's intrinsic height: reporting it back would lock the card shut.
export function viewportLayout(context = {}, viewportHeight, legacy = {}) {
  const mode = context.displayMode ?? legacy.displayMode ?? 'inline';
  const bounds = context.containerDimensions;
  const limit = bounds?.height ?? bounds?.maxHeight ?? legacy.maxHeight;
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const collapsed = mode === 'inline' && (viewportHeight < 280 || hasLimit && limit < 280);
  let height = collapsed ? 640 : viewportHeight;
  if (hasLimit) height = Math.min(height, limit);
  if (collapsed) height = Math.max(560, height);
  return { height: Math.round(Math.max(1, height)), collapsed, mode };
}

export async function requestPresentation(bridge, mode, native = window.openai) {
  // Some mobile hosts expose the native API without advertising MCP modes.
  if (typeof native?.requestDisplayMode === 'function') {
    let timer;
    try {
      const result = await Promise.race([
        native.requestDisplayMode({ mode }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Display request timed out')), 5000); }),
      ]);
      return result?.mode ?? native.displayMode ?? 'inline';
    } catch { /* The standard bridge can still be available. */ }
    finally { clearTimeout(timer); }
  }
  const modes = bridge.getHostContext()?.availableDisplayModes;
  if (modes && !modes.includes(mode)) return 'inline';
  const result = await bridge.requestDisplayMode({ mode }, { timeout: 5000 });
  return result.mode;
}
