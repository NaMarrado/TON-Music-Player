import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { StudioStackParamList } from '../types/navigation';
import { StudioScreen } from '../screens/studio-screen';
import { stackScreenOptions } from './screen-options';

const Stack = createNativeStackNavigator<StudioStackParamList>();

export function StudioStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Studio" component={StudioScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
