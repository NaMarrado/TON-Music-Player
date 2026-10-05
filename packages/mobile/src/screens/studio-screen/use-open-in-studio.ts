import { useCallback } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { Track } from '@ton/core';
import { editTrackInStudio } from '../../stores/studio-store';
import { setStudioTabEnabled, useStudioTabStore } from '../../stores/studio-tab-store';
import type { TabParamList } from '../../types/navigation';

/** Edit in Studio: opens the song alone in Studio. The Studio tab is switched on first when it is hidden. */
export function useOpenInStudio(): (track: Track) => void {
  const navigation = useNavigation<NavigationProp<TabParamList>>();
  return useCallback((track: Track) => {
    void editTrackInStudio(track);
    const open = () => navigation.navigate('StudioTab', { screen: 'Studio' });
    if (useStudioTabStore.getState().enabled) {
      open();
      return;
    }
    // The tab only exists once the navigator has re-rendered with it switched on.
    void setStudioTabEnabled(true).then(() => setTimeout(open, 0));
  }, [navigation]);
}
