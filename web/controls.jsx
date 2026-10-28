import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Keep focus and background interactions inside the active dialog, including portals.
export function Dialog({ labelId, className = '', onClose, returnFocus, children }) {
  const dialog = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = (returnFocus && document.querySelector(returnFocus)) || document.activeElement;
    const siblings = [...document.getElementById('root').children];
    const inertValues = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    const focusables = () => [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
    (dialog.current.querySelector('[autofocus]') ?? focusables()[0] ?? dialog.current).focus({ preventScroll: true });
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const list = focusables(), first = list[0], last = list.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => { document.removeEventListener('keydown', keyboard, true); siblings.forEach((node, index) => { node.inert = inertValues[index]; }); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} className={className} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1}>{children}</section></div>, document.body);
}

// Same five blocks in every row; only their fill changes between phases.
export function LevelGlyph({ value }) {
  return <svg className="level-glyph" viewBox="0 0 54 18" width="54" height="18" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <rect key={index} x={2 + index * 10} y="2" width="7" height="14" rx="2" className={index <= value ? 'filled-block' : 'empty-block'} />)}</svg>;
}

export function FloatingDetails({ className, panelClass, label, children, closeOnAction = false }) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState(null);
  const anchor = useRef(null), panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const trigger = anchor.current.querySelector('summary');
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(panelClass === 'level-options' ? 224 : 190, window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 18, above = rect.top - 18;
    const upward = below < 180 && above > below;
    setPosition({ position: 'fixed', top: upward ? 'auto' : rect.bottom + 6, bottom: upward ? window.innerHeight - rect.top + 6 : 'auto', left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width, maxHeight: Math.max(0, Math.min(300, upward ? above : below)) });
    const outside = event => { if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false); };
    const keyboard = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.focus({ preventScroll: true }); } };
    const scroll = event => { if (!panel.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', keyboard, true); document.addEventListener('focusin', outside); window.addEventListener('resize', scroll); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', keyboard, true); document.removeEventListener('focusin', outside); window.removeEventListener('resize', scroll); window.removeEventListener('scroll', scroll, true); };
  }, [open, panelClass]);
  useEffect(() => { if (open && position) panel.current?.querySelector('input,button')?.focus({ preventScroll: true }); }, [open, position]);
  return <details ref={anchor} className={className} open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary aria-expanded={open}>{label}</summary>{open && position && createPortal(<div ref={panel} className={panelClass} style={position} onClick={event => { if (closeOnAction && event.target.closest('button')) { setOpen(false); anchor.current.querySelector('summary').focus({ preventScroll: true }); } }}>{children}</div>, document.body)}</details>;
}

export function SelectMenu({ label, value, options, onChange, disabled = false }) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [position, setPosition] = useState(null);
  const trigger = useRef(null), menu = useRef(null), id = useId();
  const close = (restoreFocus = false) => { setOpen(false); if (restoreFocus) trigger.current?.focus({ preventScroll: true }); };
  const show = () => { if (disabled) return; setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true); };
  const choose = option => { onChange(option.value); close(true); };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 24);
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      setPosition({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: Math.max(0, Math.min(280, bottom - rect.bottom - 18)) });
    };
    const dismiss = event => { if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close(); };
    const scrolled = event => { if (!menu.current?.contains(event.target)) close(); };
    place();
    document.addEventListener('pointerdown', dismiss, true); window.addEventListener('resize', place); window.addEventListener('scroll', scrolled, true);
    return () => { document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('resize', place); window.removeEventListener('scroll', scrolled, true); };
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  const keyboard = event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (open && ['Enter', ' '].includes(event.key)) { event.preventDefault(); choose(options[active]); }
    else if (event.key === 'Tab') close();
    else if (open && event.key.length === 1 && !event.ctrlKey && !event.metaKey) { const index = options.findIndex(option => option.label.toLowerCase().startsWith(event.key.toLowerCase())); if (index >= 0) { event.preventDefault(); setActive(index); } }
  };
  return <div className="select-field"><button ref={trigger} type="button" className="select-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={keyboard}><span>{options.find(option => option.value === value)?.label ?? ''}</span><svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="m1 1 5 5 5-5" /></svg></button>{open && position && createPortal(<div ref={menu} id={id} className="select-popover" role="listbox" aria-label={`${label}选项`} style={position}>{options.map((option, index) => <button type="button" role="option" id={`${id}-${index}`} key={option.value} tabIndex={-1} data-option-index={index} aria-selected={value === option.value} className={index === active ? 'active-option' : ''} onPointerMove={() => setActive(index)} onClick={() => choose(option)}><span>{option.label}</span>{value === option.value && <span aria-hidden="true">✓</span>}</button>)}</div>, document.body)}</div>;
}
