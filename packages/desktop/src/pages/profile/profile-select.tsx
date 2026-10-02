import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

/** A native <select> popup cannot be styled (no pointer cursor, no theme), so Profile uses this listbox. */
export function ProfileSelect({ value, options, onChange, label, hint }: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string;
  hint: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const show = () => { setActive(selectedIndex); setOpen(true); };
  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, options.length - 1));
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(options.length - 1);
    else if (event.key === 'Enter' || event.key === ' ') choose(active);
    else if (event.key === 'Escape' || event.key === 'Tab') setOpen(false);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  };

  return (
    <div className="profile-select" ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="profile-select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        data-hint={hint}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <span>{options[selectedIndex]?.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <ul id={listId} className="profile-select-list" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              data-active={index === active}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
