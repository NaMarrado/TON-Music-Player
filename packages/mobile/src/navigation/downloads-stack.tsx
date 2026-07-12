import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { DownloadsStackParamList } from '../types/navigation';
import { DownloadsScreen } from '../screens/downloads-screen';
import { stackScreenOptions } from './screen-options';

const Stack = createNativeStackNavigator<DownloadsStackParamList>();

export function DownloadsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Downloads" component={DownloadsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
