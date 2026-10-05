import { Pressable, Text, View } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { SearchInput } from '../../components/search-input';
import { SectionLabel } from '../../components/section-label';
import { setStarredOnly } from '../../stores/library-store';
import { setFilterQuery } from './use-library-screen';

export function SongsHeader({
  sectionLabel,
  filterValue,
  filterPlaceholder,
  showPlayAll,
  playAllLabel,
  summaryLabel,
  starredOnly,
  starredLabel,
  onPlayAll,
}: {
  sectionLabel: string;
  filterValue: string;
  filterPlaceholder: string;
  showPlayAll: boolean;
  playAllLabel: string;
  summaryLabel: string;
  starredOnly: boolean;
  starredLabel: string;
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
        <Pressable
          onPress={() => setStarredOnly(!starredOnly)}
          accessibilityRole="button"
          accessibilityState={{ selected: starredOnly }}
          className={`flex-row items-center px-3 py-1.5 rounded-full ${starredOnly ? 'bg-white/20' : 'bg-bg-surface'}`}
          style={{ marginLeft: showPlayAll ? 8 : 0 }}
        >
          <FontAwesome name={starredOnly ? 'star' : 'star-o'} size={13} color={starredOnly ? '#ffffff' : '#9a9a9a'} />
          <Text className={`text-[13px] font-semibold ml-1.5 ${starredOnly ? 'text-white' : 'text-text-secondary'}`}>
            {starredLabel}
          </Text>
        </Pressable>
        <Text
          className="text-text-secondary text-xs text-right"
          style={{
            flexGrow: 1,
            flexShrink: 1,
            fontVariant: ['tabular-nums'],
            marginLeft: 12,
            minWidth: 160,
          }}
        >
          {summaryLabel}
        </Text>
      </View>
    </>
  );
}
