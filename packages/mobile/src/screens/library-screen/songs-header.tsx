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
  summaryLabel,
  onPlayAll,
}: {
  sectionLabel: string;
  filterValue: string;
  filterPlaceholder: string;
  showPlayAll: boolean;
  playAllLabel: string;
  summaryLabel: string;
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

      <View className="flex-row flex-wrap items-center justify-between px-4 mt-2 mb-2">
        {showPlayAll && (
          <Pressable
            onPress={onPlayAll}
            className="flex-row items-center px-4 py-1.5 bg-white rounded-full"
          >
            <Feather name="play" size={14} color="#050505" />
            <Text className="text-black text-[13px] font-semibold ml-1.5">{playAllLabel}</Text>
          </Pressable>
        )}
        <Text
          className="text-text-secondary text-xs text-right"
          style={{
            flexGrow: 1,
            flexShrink: 1,
            fontVariant: ['tabular-nums'],
            marginLeft: showPlayAll ? 12 : 0,
            minWidth: 160,
          }}
        >
          {summaryLabel}
        </Text>
      </View>
    </>
  );
}
