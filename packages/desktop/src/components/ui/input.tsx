import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'rounded';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ variant = 'default', className = '', style, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full outline-none ${className}`}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: variant === 'rounded' ? '20px' : '8px',
          padding: '10px 14px',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: '0.88rem',
          transition: 'var(--transition)',
          ...style,
        }}
        {...props}
      />
    );
  },
);
