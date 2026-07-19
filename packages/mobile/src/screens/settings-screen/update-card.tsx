import { Pressable, Text, View } from 'react-native';
import { SectionHeader, SettingsCard } from './primitives';

export function UpdateCard({
  title,
  currentVersionLabel,
  currentVersionValue,
  latestVersionLabel,
  latestVersionValue,
  checkForUpdatesLabel,
  checkingForUpdatesLabel,
  preparingUpdateLabel,
  updateStatusText,
  isCheckingUpdates,
  isPreparingUpdate,
  canOpenUpdate,
  openUpdateLabel,
  onCheckForUpdates,
  onOpenUpdate,
  newVersionAvailableLabel,
}: {
  title: string;
  currentVersionLabel: string;
  currentVersionValue: string;
  latestVersionLabel: string;
  latestVersionValue: string | null;
  checkForUpdatesLabel: string;
  checkingForUpdatesLabel: string;
  preparingUpdateLabel: string;
  updateStatusText: string | null;
  isCheckingUpdates: boolean;
  isPreparingUpdate: boolean;
  canOpenUpdate: boolean;
  openUpdateLabel: string;
  onCheckForUpdates: () => void;
  onOpenUpdate: () => void;
  newVersionAvailableLabel: string;
}) {
  const hasUpdate = canOpenUpdate;
  return (
    <SettingsCard attention={hasUpdate}>
      {hasUpdate && (
        <View
          pointerEvents="none"
          style={{
            alignItems: 'center',
            backgroundColor: '#ff3b3b',
            borderColor: '#111111',
            borderRadius: 999,
            borderWidth: 3,
            height: 28,
            justifyContent: 'center',
            position: 'absolute',
            right: -10,
            top: -10,
            width: 28,
            zIndex: 2,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>!</Text>
        </View>
      )}
      <SectionHeader icon="refresh-cw" title={title} />
      <View className="ml-[38px] gap-3">
        {hasUpdate && (
          <Text style={{ color: '#ff5757', fontSize: 13, fontWeight: '700' }}>
            {newVersionAvailableLabel}
          </Text>
        )}
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-text-secondary text-xs">{currentVersionLabel}</Text>
          <Text className="text-text-primary text-xs font-medium">{currentVersionValue}</Text>
        </View>

        {latestVersionValue && (
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-text-secondary text-xs">{latestVersionLabel}</Text>
            <Text className="text-text-primary text-xs font-medium">{latestVersionValue}</Text>
          </View>
        )}

        <View className="flex-row flex-wrap items-center mt-1 gap-2">
          <Pressable
            onPress={onCheckForUpdates}
            disabled={isCheckingUpdates || isPreparingUpdate}
            className="border border-border"
            style={{
              borderRadius: 999,
              paddingVertical: 9,
              paddingHorizontal: 14,
              opacity: isCheckingUpdates || isPreparingUpdate ? 0.7 : 1,
            }}
          >
            <Text className="text-text-primary text-[13px] font-semibold">
              {isCheckingUpdates ? checkingForUpdatesLabel : checkForUpdatesLabel}
            </Text>
          </Pressable>

          {canOpenUpdate && (
            <Pressable
              onPress={onOpenUpdate}
              disabled={isPreparingUpdate}
              className="bg-white items-center"
              style={{
                borderRadius: 999,
                paddingVertical: 9,
                paddingHorizontal: 14,
                opacity: isPreparingUpdate ? 0.75 : 1,
              }}
            >
              <Text className="text-black text-[13px] font-semibold">
                {isPreparingUpdate ? preparingUpdateLabel : openUpdateLabel}
              </Text>
            </Pressable>
          )}
        </View>

        {updateStatusText && (
          <Text className="text-text-secondary text-xs mt-1">{updateStatusText}</Text>
        )}
      </View>
    </SettingsCard>
  );
}
