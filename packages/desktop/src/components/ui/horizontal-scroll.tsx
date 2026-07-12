interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
}

export function HorizontalScroll({ children, className = '' }: HorizontalScrollProps) {
  return (
    <div
      className={`scrollbar-hidden flex gap-2 overflow-x-auto ${className}`}
    >
      {children}
    </div>
  );
}
