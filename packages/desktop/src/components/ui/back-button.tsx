import { useNavigate } from 'react-router';

export function BackButton({ label }: { label: string }) {
  const navigate = useNavigate();

  return (
    <div className="px-8" style={{ paddingTop: 'var(--desktop-page-top)' }}>
      <button
        className="flex items-center gap-1 cursor-pointer"
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {label}
      </button>
    </div>
  );
}
