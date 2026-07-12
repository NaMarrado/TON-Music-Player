import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '../types/navigation';

export function getTabPerformanceOptions(
  _routeName: keyof TabParamList,
): BottomTabNavigationOptions {
  return {
    headerShown: false,
    lazy: true,
  };
}
