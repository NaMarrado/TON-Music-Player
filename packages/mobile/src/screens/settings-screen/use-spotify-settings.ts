import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSetting, setSetting } from '../../services/db-queries';
import { showToast } from '../../stores/toast-store';

export function useSpotifySettings() {
  const { t } = useTranslation('settings');
  const [spotifyId, setSpotifyId] = useState('');
  const [spotifySecret, setSpotifySecret] = useState('');
  const [spotifyLoaded, setSpotifyLoaded] = useState(false);

  const loadSpotifyCreds = useCallback(async () => {
    if (spotifyLoaded) {
      return;
    }

    const [id, secret] = await Promise.all([
      getSetting('spotify_client_id'),
      getSetting('spotify_client_secret'),
    ]);
    setSpotifyId(id ?? '');
    setSpotifySecret(secret ?? '');
    setSpotifyLoaded(true);
  }, [spotifyLoaded]);

  const saveSpotifyCreds = useCallback(async () => {
    await Promise.all([
      setSetting('spotify_client_id', spotifyId),
      setSetting('spotify_client_secret', spotifySecret),
    ]);
    showToast(t('spotifySaved'), 'success');
  }, [spotifyId, spotifySecret, t]);

  return {
    loadSpotifyCreds,
    saveSpotifyCreds,
    setSpotifyId,
    setSpotifySecret,
    spotifyId,
    spotifyLoaded,
    spotifySecret,
  };
}
