interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

const STYLES: Record<string, React.CSSProperties> = {
  primary: {
    background: 'var(--white)',
    color: 'var(--bg-deep)',
    border: 'none',
    fontWeight: 500,
  },
  secondary: {
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  style,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyle = STYLES[variant];
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-[0.78rem]' : 'px-5 py-2 text-[0.82rem]';

  return (
    <button
      className={`rounded-lg cursor-pointer ${sizeClass} ${className}`}
      style={{
        ...baseStyle,
        fontSize: size === 'sm' ? '0.78rem' : '0.82rem',
        transition: 'var(--transition)',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      disabled={disabled}
      {...props}
    />
  );
}
