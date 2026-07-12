export function HomeHeader({ title }: { title: string }) {
  return (
    <div
      className="shrink-0 sticky top-0 z-10"
      style={{
        padding: '44px 32px 20px',
        background: 'linear-gradient(var(--bg-deep) 60%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <h1
        className="text-[1.7rem] font-bold tracking-tight"
        style={{ fontFamily: "'Syne', sans-serif", color: 'var(--white)' }}
      >
        {title}
      </h1>
    </div>
  );
}
