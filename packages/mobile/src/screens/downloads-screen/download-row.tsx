import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cancelDownload, retryDownload, useDownloadItem } from '../../stores/download-store';
import { AutoMarqueeText } from '../../components/auto-marquee-text';

export const DownloadRow = memo(function DownloadRow({ itemId }: { itemId: number }) {
  const { t } = useTranslation('downloads');
  const item = useDownloadItem(itemId);
  if (!item) {
    return null;
  }
  const isActive = item.status === 'downloading' || item.status === 'retrying';
  const isError = item.status === 'error';
  const isDone = item.status === 'completed';
  const canCancel = item.status === 'pending' || isActive;

  return (
    <View
      className="flex-row items-center px-4"
      style={{
        minHeight: 64,
        paddingVertical: isError ? 8 : 0,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <View
        className="items-center justify-center rounded-lg"
        style={{ width: 42, height: 42, backgroundColor: isDone ? 'rgba(34,197,94,0.1)' : isError ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)' }}
      >
        <Feather
          name={isDone ? 'check' : isError ? 'alert-circle' : 'download'}
          size={18}
          color={isDone ? '#22c55e' : isError ? '#ef4444' : '#e8e8e8'}
        />
      </View>
      <View className="flex-1 ml-3 mr-2">
        <AutoMarqueeText
          active={isActive}
          text={item.input.title}
          className="text-text-primary text-[13px] font-medium"
        />
        <AutoMarqueeText
          active={isActive}
          text={item.input.artist}
          className="text-text-secondary text-xs"
        />
        {isActive && (
          <View className="h-1 bg-bg-elevated rounded-full mt-1.5 overflow-hidden">
            <View
              className="h-full bg-white rounded-full"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </View>
        )}
        {isError && item.error && (
          <Text
            style={{ fontSize: 10, lineHeight: 13, color: '#ef4444', marginTop: 2 }}
            numberOfLines={2}
          >
            {item.error}
          </Text>
        )}
      </View>

      {isActive && (
        <Text className="text-text-muted text-xs mr-2" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.round(item.progress * 100)}%
        </Text>
      )}
      {canCancel && (
        <Pressable
          onPress={() => void cancelDownload(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t('cancel')}
          hitSlop={8}
          className="flex-row items-center rounded-full border px-2.5 py-1.5"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderColor: 'rgba(255,255,255,0.1)',
          }}
        >
          <Feather name="x" size={14} color="#e8e8e8" />
          <Text className="text-text-primary text-[11px] font-semibold ml-1">
            {t('cancel')}
          </Text>
        </Pressable>
      )}
      {isError && (
        <Pressable onPress={() => void retryDownload(item.id)} hitSlop={8} className="p-2">
          <Feather name="refresh-cw" size={16} color="#e8e8e8" />
        </Pressable>
      )}
    </View>
  );
});
