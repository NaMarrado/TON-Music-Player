import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toggleTrackStar } from '../../../stores/library-store';
import { showToast } from '../../../stores/toast-store';

export function StarButton({ trackId, rating, disabled = false }: {
  trackId: number;
  rating: number | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation('pages/library');
  // The star shows the clicked state at once; if saving fails it flips back and a toast says so.
  const [savingStarred, setSavingStarred] = useState<boolean | null>(null);
  const pendingRef = useRef(false);
  const pending = savingStarred !== null;
  const starred = savingStarred ?? (rating ?? 0) > 0;
  const label = t(starred ? 'unstarTrack' : 'starTrack');

  return (
    <button
      type="button"
      className="track-star-button"
      aria-label={label}
      title={label}
      aria-pressed={starred}
      disabled={disabled || pending}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={async (event) => {
        event.stopPropagation();
        if (pendingRef.current) return;
        pendingRef.current = true;
        setSavingStarred(!starred);
        try {
          await toggleTrackStar(trackId);
        } catch {
          showToast(t('starFailed'), 'error');
        } finally {
          pendingRef.current = false;
          setSavingStarred(null);
        }
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" />
      </svg>
    </button>
  );
}
