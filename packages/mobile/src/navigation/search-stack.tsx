import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SearchStackParamList } from '../types/navigation';
import { SearchScreen } from '../screens/search-screen';
import { AlbumScreen } from '../screens/album-screen';
import { ArtistScreen } from '../screens/artist-screen';
import { stackScreenOptions } from './screen-options';

const Stack = createNativeStackNavigator<SearchStackParamList>();

export function SearchStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Album" component={AlbumScreen} />
      <Stack.Screen name="Artist" component={ArtistScreen} />
    </Stack.Navigator>
  );
}
