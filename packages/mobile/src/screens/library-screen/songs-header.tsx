import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SearchInput } from '../../components/search-input';
import { SectionLabel } from '../../components/section-label';
import { setFilterQuery } from './use-library-screen';

export function SongsHeader({
  sectionLabel,
  filterValue,
  filterPlaceholder,
  showPlayAll,
  playAllLabel,
  trackCountLabel,
  onPlayAll,
}: {
  sectionLabel: string;
  filterValue: string;
  filterPlaceholder: string;
  showPlayAll: boolean;
  playAllLabel: string;
  trackCountLabel: string;
  onPlayAll: () => void;
}) {
  return (
    <>
      <SectionLabel label={sectionLabel} />
      <View className="py-1">
        <SearchInput
          value={filterValue}
          onChangeText={setFilterQuery}
          placeholder={filterPlaceholder}
        />
      </View>

      {showPlayAll && (
        <View className="flex-row items-center justify-between px-4 mt-2 mb-2">
          <Pressable
            onPress={onPlayAll}
            className="flex-row items-center px-4 py-1.5 bg-white rounded-full"
          >
            <Feather name="play" size={14} color="#050505" />
            <Text className="text-black text-[13px] font-semibold ml-1.5">{playAllLabel}</Text>
          </Pressable>
          <Text className="text-text-secondary text-xs" style={{ fontVariant: ['tabular-nums'] }}>
            {trackCountLabel}
          </Text>
        </View>
      )}
    </>
  );
}
