import { create } from 'zustand';

interface DiscordPresenceState {
  enabled: boolean;
  loaded: boolean;
}

export const useDiscordPresenceStore = create<DiscordPresenceState>()(() => ({
  enabled: true,
  loaded: false,
}));
