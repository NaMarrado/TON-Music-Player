export function SortArrow({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return null;

  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: '3px', opacity: 0.8 }}
    >
      {dir === 'asc' ? (
        <polyline points="18 15 12 9 6 15" />
      ) : (
        <polyline points="6 9 12 15 18 9" />
      )}
    </svg>
  );
}
