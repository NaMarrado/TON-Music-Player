import type { MouseEvent, ReactNode } from 'react';
import { sliderPositionOf, sliderValueAt } from '@ton/core';
import { useControlText } from './use-control-text';

interface ButtonProps {
  control: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** A toggled or selected state. */
  active?: boolean;
  /** Greyed out but still hoverable, so its explanation stays readable. */
  disabled?: boolean;
  /** Shows the name next to the icon. Otherwise the button is icon-only. */
  label?: boolean;
  /** `primary` is the one filled call to action of a region. */
  tone?: 'plain' | 'primary';
  children?: ReactNode;
}

export function StudioButton({ control, onClick, active = false, disabled = false, label = false, tone = 'plain', children }: ButtonProps) {
  const { name, text } = useControlText(control);
  return (
    <button
      type="button"
      className="studio-btn"
      data-tone={tone}
      data-labelled={label || undefined}
      data-control={control}
      data-hint={name}
      data-hint-text={text}
      aria-label={name}
      aria-pressed={active || undefined}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
      {label && <span className="studio-label">{name}</span>}
    </button>
  );
}

interface SliderProps {
  control: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Hides the name and value; used by the compact zoom slider in the header. */
  bare?: boolean;
  /** The value a double click puts back (the neutral setting). */
  resetTo?: number;
  /**
   * The value in the middle of the slider. When set, the slider is finer near it and coarser towards the ends, so a wide
   * range stays easy to set precisely.
   */
  neutral?: number;
}

export function StudioSlider({ control, value, min, max, step, format, onChange, disabled = false, bare = false, resetTo, neutral }: SliderProps) {
  const { name, text } = useControlText(control);
  const soft = neutral !== undefined;
  const input = (
    <input
      type="range"
      data-control={control}
      data-hint={name}
      data-hint-text={text}
      aria-label={name}
      aria-valuetext={format(value)}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      min={soft ? -1 : min}
      max={soft ? 1 : max}
      step={soft ? 0.001 : step}
      value={soft ? sliderPositionOf(value, min, max, neutral) : value}
      onChange={(event) => {
        if (disabled) return;
        const raw = Number(event.target.value);
        onChange(soft ? sliderValueAt(raw, min, max, neutral, step) : raw);
      }}
      onDoubleClick={disabled || resetTo === undefined ? undefined : () => onChange(resetTo)}
    />
  );
  if (bare) return input;
  return (
    <label className="studio-slider" data-hint={name} data-hint-text={text} aria-disabled={disabled || undefined}>
      <span className="studio-slider-name">{name}</span>
      {input}
      <output>{format(value)}</output>
    </label>
  );
}

/** A titled group of related controls in the Edit panel. */
export function StudioSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="studio-section" data-section={id}>
      <h3 className="studio-section-title">{title}</h3>
      <div className="studio-section-body">{children}</div>
    </section>
  );
}
