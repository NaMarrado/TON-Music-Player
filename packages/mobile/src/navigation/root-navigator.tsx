import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { TabNavigator } from './tab-navigator';
import { notificationLinking } from './notification-linking';
import { NowPlayingScreen } from '../screens/now-playing-screen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const TONTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#ffffff',
    background: '#050505',
    card: '#0a0a0a',
    text: '#e8e8e8',
    border: '#1e1e1e',
    notification: '#ffffff',
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer linking={notificationLinking} theme={TONTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabNavigator} />
        <Stack.Screen
          name="NowPlaying"
          component={NowPlayingScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
