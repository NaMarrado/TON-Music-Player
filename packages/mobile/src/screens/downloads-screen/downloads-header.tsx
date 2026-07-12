import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';

type DownloadsHeaderProps = {
  title: string;
  importLabel: string;
  cancelAllLabel: string;
  activeCount: number;
  hasClearable: boolean;
  hasCancellable: boolean;
  noticeLabel?: string | null;
  noticeActionLabel?: string | null;
  onImportPress: () => void;
  onCancelAllPress: () => void;
  onClearPress: () => void;
  onNoticeAction?: (() => void) | null;
};

export function DownloadsHeader({
  title,
  importLabel,
  cancelAllLabel,
  activeCount,
  hasClearable,
  hasCancellable,
  noticeLabel,
  noticeActionLabel,
  onImportPress,
  onCancelAllPress,
  onClearPress,
  onNoticeAction,
}: DownloadsHeaderProps) {
  const topPadding = useScreenTopPadding(8);

  return (
    <View className="px-4 pb-2" style={{ paddingTop: topPadding }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="text-white text-2xl font-bold">{title}</Text>
          {activeCount > 0 && (
            <View
              className="ml-2 rounded-full items-center justify-center"
              style={{ minWidth: 22, height: 22, paddingHorizontal: 7, backgroundColor: 'rgba(255,255,255,0.1)' }}
            >
              <Text className="text-white text-[11px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                {activeCount}
              </Text>
            </View>
          )}
        </View>
        {hasClearable && (
          <Pressable onPress={onClearPress} hitSlop={8}>
            <Feather name="trash-2" size={18} color="#888" />
          </Pressable>
        )}
      </View>
      <View className="flex-row items-center gap-2 mt-3">
        <Pressable
          onPress={onImportPress}
          className="flex-row items-center justify-center px-3.5 py-2 rounded-full border border-border bg-bg-surface"
          style={{ flex: hasCancellable ? 1 : undefined }}
        >
          <Feather name="plus" size={14} color="#e8e8e8" style={{ marginRight: 4 }} />
          <Text className="text-text-primary text-xs" numberOfLines={1}>{importLabel}</Text>
        </Pressable>
        {hasCancellable && (
          <Pressable
            onPress={onCancelAllPress}
            className="flex-1 flex-row items-center justify-center px-3.5 py-2 rounded-full border"
            style={{
              borderColor: 'rgba(239,68,68,0.55)',
              backgroundColor: 'rgba(239,68,68,0.08)',
            }}
          >
            <Feather name="x" size={14} color="#f87171" style={{ marginRight: 4 }} />
            <Text className="text-xs font-semibold" style={{ color: '#f87171' }} numberOfLines={1}>
              {cancelAllLabel}
            </Text>
          </Pressable>
        )}
      </View>
      {noticeLabel ? (
        <View
          className="mt-3 rounded-xl border px-3 py-2"
          style={{
            borderColor: 'rgba(245,158,11,0.28)',
            backgroundColor: 'rgba(245,158,11,0.08)',
          }}
        >
          <Text className="text-[12px]" style={{ color: '#fbbf24' }}>
            {noticeLabel}
          </Text>
          {noticeActionLabel && onNoticeAction ? (
            <Pressable onPress={onNoticeAction} className="mt-2 self-start">
              <Text className="text-[12px] font-semibold" style={{ color: '#fde68a' }}>
                {noticeActionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
