import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { LibraryStackParamList } from '../types/navigation';
import { LibraryScreen } from '../screens/library-screen';
import { PlaylistScreen } from '../screens/playlist-screen';
import { AlbumScreen } from '../screens/album-screen';
import { ArtistScreen } from '../screens/artist-screen';
import { stackScreenOptions } from './screen-options';

const Stack = createNativeStackNavigator<LibraryStackParamList>();

export function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Library" component={LibraryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Playlist" component={PlaylistScreen} />
      <Stack.Screen name="Album" component={AlbumScreen} />
      <Stack.Screen name="Artist" component={ArtistScreen} />
    </Stack.Navigator>
  );
}
