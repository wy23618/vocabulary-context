import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Same five blocks in every row; only their fill changes between phases.
export function LevelGlyph({ value }) {
  return <svg className="level-glyph" viewBox="0 0 54 18" width="54" height="18" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <rect key={index} x={2 + index * 10} y="2" width="7" height="14" rx="2" className={index <= value ? 'filled-block' : 'empty-block'} />)}</svg>;
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
      setPosition({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: Math.max(0, Math.min(280, window.innerHeight - rect.bottom - 18)) });
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
  };
  return <div className="select-field"><button ref={trigger} type="button" className="select-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={keyboard}><span>{options.find(option => option.value === value)?.label ?? ''}</span><svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="m1 1 5 5 5-5" /></svg></button>{open && position && createPortal(<div ref={menu} id={id} className="select-popover" role="listbox" aria-label={`${label}选项`} style={position}>{options.map((option, index) => <button type="button" role="option" id={`${id}-${index}`} key={option.value} tabIndex={-1} data-option-index={index} aria-selected={value === option.value} className={index === active ? 'active-option' : ''} onPointerMove={() => setActive(index)} onClick={() => choose(option)}><span>{option.label}</span>{value === option.value && <span aria-hidden="true">✓</span>}</button>)}</div>, document.body)}</div>;
}
