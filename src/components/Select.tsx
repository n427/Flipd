'use client';

// Flipd — custom listbox. Replaces native <select>, whose option menu is drawn
// by the OS and can't be styled to match the rest of the form.
import React from 'react';
import { Icon } from './Icon';

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  label: string;
}

export function Select({ value, onChange, options, placeholder, label }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  // Which option the keyboard is on. Kept apart from `value` so arrowing
  // through the list doesn't commit a choice until Enter.
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  const openAt = (index: number) => { setActive(index); setOpen(true); };

  // Click-away and Escape both close without committing.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the scroll edge.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Tab') { setOpen(false); return; }

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openAt(Math.max(0, options.indexOf(value)));
      }
      return;
    }

    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(options[active]);
      setOpen(false);
    } else if (e.key.length === 1) {
      // Type-ahead, matching the affordance native <select> gives for free.
      const i = options.findIndex((o) => o.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openAt(Math.max(0, options.indexOf(value))))}
        onKeyDown={onKeyDown}
        className="field"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, cursor: 'pointer', textAlign: 'left',
          borderColor: open ? 'var(--ink)' : undefined,
        }}
      >
        <span style={{ color: value ? 'var(--ink)' : 'var(--muted)' }}>{value || placeholder}</span>
        <Icon
          name="chevronDown"
          size={16}
          color="var(--muted)"
          style={{ flexShrink: 0, transition: 'transform 160ms ease-out', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40,
            background: '#fff', border: '1.5px solid var(--rule)', borderRadius: 12,
            padding: 4, maxHeight: 264, overflowY: 'auto',
            boxShadow: '0 4px 6px -2px rgba(17,17,17,0.04), 0 12px 28px -6px rgba(17,17,17,0.14)',
            animation: 'flipd-select-in 130ms ease-out',
          }}
        >
          {options.map((opt, i) => {
            const selected = opt === value;
            return (
              <div
                key={opt}
                data-i={i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 14.5, lineHeight: 1.2,
                  fontWeight: selected ? 600 : 400,
                  color: 'var(--ink)',
                  background: i === active ? 'var(--surface)' : 'transparent',
                }}
              >
                {opt}
                {selected && <Icon name="check" size={15} color="var(--accent)" style={{ flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
