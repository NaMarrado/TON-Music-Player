import { useCallback, useEffect, useState } from 'react';
import { useSetting } from '../use-setting';

export interface SpotifyTranslator {
  (key: string, opts?: Record<string, unknown>): string;
}

export function useSpotifyCredentials() {
  const clientId = useSetting('spotify_client_id');
  const clientSecret = useSetting('spotify_client_secret');
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (clientId.loaded) {
      setId(clientId.value || '');
    }
  }, [clientId.loaded, clientId.value]);

  useEffect(() => {
    if (clientSecret.loaded) {
      setSecret(clientSecret.value || '');
    }
  }, [clientSecret.loaded, clientSecret.value]);

  const handleSave = useCallback(async () => {
    await clientId.save(id);
    await clientSecret.save(secret);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }, [clientId, clientSecret, id, secret]);

  return {
    handleSave,
    hasCredentials: !!(clientId.value && clientSecret.value),
    id,
    saved,
    secret,
    setId,
    setSecret,
    setShowHelp,
    showHelp,
  };
}
