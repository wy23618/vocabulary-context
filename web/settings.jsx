import React from 'react';
import { Dialog } from './controls.jsx';

export const appearanceDefaults = { theme: 'system', fontSize: 20, lineHeight: 1.95, highlight: true, density: 'comfortable' };
export function normalizeAppearance(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return {
    theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
    fontSize: [18, 20, 22, 24].includes(value.fontSize) ? value.fontSize : 20,
    lineHeight: [1.7, 1.95, 2.2].includes(value.lineHeight) ? value.lineHeight : 1.95,
    highlight: value.highlight !== false,
    density: value.density === 'compact' ? 'compact' : 'comfortable',
  };
}

function Choices({ label, value, options, onChange }) {
  return <fieldset className="setting-choices"><legend>{label}</legend><div>{options.map(([key, text]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}</div></fieldset>;
}

export function Settings({ value, onChange, onSave, onClose, busy, error }) {
  const change = partial => onChange({ ...value, ...partial });
  return <Dialog labelId="settings-title" className="settings-modal" onClose={onClose}>
    <div className="settings-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h2 id="settings-title">按你的习惯学习</h2><p className="muted small">即时预览，保存后下次打开仍然生效。</p></div><button className="icon-button" aria-label="关闭设置" disabled={busy} onClick={onClose}>×</button></div>
    <fieldset className="settings-content" disabled={busy}>
      <Choices label="外观" value={value.theme} options={[[ 'system', '跟随应用' ], [ 'light', '浅色' ], [ 'dark', '深色' ]]} onChange={theme => change({ theme })} />
      <Choices label="词库间距" value={value.density} options={[[ 'comfortable', '舒适' ], [ 'compact', '紧凑' ]]} onChange={density => change({ density })} />
      <div className="settings-reading"><Choices label="阅读字号" value={value.fontSize} options={[[18, '18'], [20, '20'], [22, '22'], [24, '24']]} onChange={fontSize => change({ fontSize })} /><Choices label="阅读行距" value={value.lineHeight} options={[[1.7, '紧凑'], [1.95, '标准'], [2.2, '宽松']]} onChange={lineHeight => change({ lineHeight })} /></div>
      <label className="setting-toggle"><span><strong>标出目标词</strong><small>用下划线提示本次练习的词汇</small></span><input type="checkbox" checked={value.highlight} onChange={event => change({ highlight: event.target.checked })} /></label>
      <div className="reading-preview"><span>阅读预览</span><p style={{ fontSize: value.fontSize, lineHeight: value.lineHeight }}>A little practice helps us <span className={value.highlight ? 'target-word' : ''}>retain</span> what we learn.</p><small>每天留一点时间，让词汇回到语境。</small></div>
    </fieldset>
    {error && <div className="modal-error" role="alert">{error}</div>}
    <div className="settings-footer"><button className="quiet" disabled={busy} onClick={() => onChange({ ...appearanceDefaults })}>恢复默认</button><button className="primary" disabled={busy} onClick={onSave}>{busy ? '正在保存…' : '保存设置'}</button></div>
  </Dialog>;
}
