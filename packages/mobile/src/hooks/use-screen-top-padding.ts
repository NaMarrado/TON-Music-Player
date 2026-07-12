import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useScreenTopPadding(basePadding = 0): number {
  const { top } = useSafeAreaInsets();
  return (Platform.OS === 'ios' ? top : 0) + basePadding;
}
