import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types/navigation';
import { HomeScreen } from '../screens/home-screen';
import { PlaylistScreen } from '../screens/playlist-screen';
import { AlbumScreen } from '../screens/album-screen';
import { ArtistScreen } from '../screens/artist-screen';
import { stackScreenOptions } from './screen-options';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Playlist" component={PlaylistScreen} />
      <Stack.Screen name="Album" component={AlbumScreen} />
      <Stack.Screen name="Artist" component={ArtistScreen} />
    </Stack.Navigator>
  );
}
