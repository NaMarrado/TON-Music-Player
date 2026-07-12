export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`text-[0.7rem] font-semibold uppercase mb-3 ${className}`}
      style={{ letterSpacing: '0.12em', color: 'var(--text-secondary)' }}
    >
      {children}
    </div>
  );
}
