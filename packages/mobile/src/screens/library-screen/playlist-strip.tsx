import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CoverImage } from '../../components/cover-image';
import { SectionLabel } from '../../components/section-label';

type LibraryPlaylist = {
  id: number;
  name: string;
  cover_path?: string | null;
};

export function PlaylistStrip({
  label,
  newPlaylistLabel,
  playlists,
  onCreatePress,
  onPlaylistPress,
}: {
  label: string;
  newPlaylistLabel: string;
  playlists: LibraryPlaylist[];
  onCreatePress: () => void;
  onPlaylistPress: (id: number) => void;
}) {
  return (
    <>
      <SectionLabel label={label} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, gap: 10 }}
      >
        <Pressable
          onPress={onCreatePress}
          style={{ width: 110 }}
          className="items-center"
        >
          <View
            className="bg-bg-elevated rounded-lg items-center justify-center"
            style={{ width: 110, height: 110, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed' }}
          >
            <Feather name="plus" size={28} color="#888" />
          </View>
          <Text className="text-text-secondary text-[11px] mt-1.5 text-center" numberOfLines={1}>
            {newPlaylistLabel}
          </Text>
        </Pressable>

        {playlists.map((playlist) => (
          <Pressable
            key={playlist.id}
            onPress={() => onPlaylistPress(playlist.id)}
            style={{ width: 110 }}
            className="items-center"
          >
            {playlist.cover_path ? (
              <CoverImage uri={playlist.cover_path} size={110} borderRadius={8} />
            ) : (
              <View
                className="items-center justify-center rounded-lg"
                style={{ width: 110, height: 110, backgroundColor: '#1a1a1a' }}
              >
                <Feather name="list" size={24} color="#888" />
              </View>
            )}
            <Text className="text-text-primary text-[11px] font-medium mt-1.5 text-center" numberOfLines={1}>
              {playlist.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}
