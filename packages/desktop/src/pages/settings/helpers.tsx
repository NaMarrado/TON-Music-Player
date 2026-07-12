import type { ReactNode } from 'react';

// ── Toggle Switch (iOS-style) ──

export function ToggleSwitch({
  enabled,
  large = false,
  onClick,
}: {
  enabled: boolean;
  large?: boolean;
  onClick: () => void;
}) {
  const width = large ? 48 : 36;
  const height = large ? 28 : 20;
  const inset = large ? 4 : 3;
  const thumbSize = large ? 20 : 14;

  return (
    <button
      onClick={onClick}
      className="toggle-switch cursor-pointer shrink-0"
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: `${height / 2}px`,
        border: 'none',
        background: enabled ? 'var(--white)' : 'var(--bg-active)',
        transition: 'background var(--transition)',
        padding: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: `${inset}px`,
          left: enabled ? `${width - thumbSize - inset}px` : `${inset}px`,
          width: `${thumbSize}px`,
          height: `${thumbSize}px`,
          borderRadius: '50%',
          background: enabled ? 'var(--bg-deep)' : 'var(--text-secondary)',
          transition: 'all var(--transition)',
        }}
      />
    </button>
  );
}

// ── Settings Group (labeled divider) ──

export function SettingsGroup({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ marginBottom: compact ? '24px' : '32px' }}>
      <div className="flex items-center gap-3" style={{ marginBottom: '16px' }}>
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <div className="flex-1" style={{ height: '1px', background: 'var(--border-subtle)' }} />
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

// ── Section Header (icon + title + optional right control) ──

export function SectionHeader({
  compact = false,
  icon,
  title,
  description,
  right,
}: {
  compact?: boolean;
  icon: ReactNode;
  title: ReactNode;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: description ? '16px' : '12px' }}>
      <div
        className="flex"
        style={{
          alignItems: compact ? 'flex-start' : 'center',
          justifyContent: compact ? 'flex-start' : 'space-between',
          flexDirection: compact ? 'column' : 'row',
          gap: compact ? '10px' : undefined,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'var(--glow-strong)',
              color: 'var(--text-secondary)',
            }}
          >
            {icon}
          </div>
          <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--white)' }}>
            {title}
          </span>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {description && (
        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            lineHeight: '1.5',
            marginTop: '8px',
            paddingLeft: compact ? 0 : '40px',
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}
