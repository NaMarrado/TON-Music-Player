import { useEffect } from 'react';
import { initializeDiscordPresence } from '../services/discord-presence';

export function useDiscordPresence(): void {
  useEffect(() => {
    void initializeDiscordPresence();
  }, []);
}
