import { useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { toggleTrackStar } from '../stores/library-store';
import { showToast } from '../stores/toast-store';

export function StarButton({ trackId, starred }: { trackId: number; starred: boolean }) {
  const { t } = useTranslation('library');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(starred ? 'unstarTrack' : 'starTrack')}
      accessibilityState={{ selected: starred, disabled: pending }}
      disabled={pending}
      hitSlop={8}
      style={{ paddingHorizontal: 8, paddingVertical: 10, marginLeft: 4 }}
      onPress={async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        try {
          await toggleTrackStar(trackId);
        } catch {
          showToast(t('starFailed'), 'error');
        } finally {
          pendingRef.current = false;
          setPending(false);
        }
      }}
    >
      <FontAwesome name={starred ? 'star' : 'star-o'} size={17} color={starred ? '#ffffff' : '#666'} />
    </Pressable>
  );
}
