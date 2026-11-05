import { useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { toggleTrackStar } from '../stores/library-store';
import { showToast } from '../stores/toast-store';

export function StarButton({ trackId, starred }: { trackId: number; starred: boolean }) {
  const { t } = useTranslation('library');
  // The star shows the tapped state at once; if saving fails it flips back and a toast says so.
  const [savingStarred, setSavingStarred] = useState<boolean | null>(null);
  const pendingRef = useRef(false);
  const pending = savingStarred !== null;
  const shownStarred = savingStarred ?? starred;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(shownStarred ? 'unstarTrack' : 'starTrack')}
      accessibilityState={{ selected: shownStarred, disabled: pending }}
      disabled={pending}
      hitSlop={8}
      style={{ paddingHorizontal: 8, paddingVertical: 10, marginLeft: 4 }}
      onPress={async () => {
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
      <FontAwesome name={shownStarred ? 'star' : 'star-o'} size={17} color={shownStarred ? '#ffffff' : '#666'} />
    </Pressable>
  );
}
