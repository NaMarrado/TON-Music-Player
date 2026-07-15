import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SettingsCard, SectionHeader } from './primitives';
import { CloudField, CloudHelpModal, CloudPill } from './cloud-card-controls';
import type { CloudCardProps } from './cloud-card-types';

export function CloudCard({
  autoSyncDescription,
  autoSyncDetailsLabel,
  autoSyncEnabled,
  autoSyncLabel,
  autoSyncStatusLabel,
  canRun,
  connectedLabel,
  description,
  failedLabel,
  form,
  hasSecret,
  helpSteps,
  helpTitle,
  isBusy,
  loaded,
  loadLabel,
  progress,
  progressLabel,
  result,
  resultLabel,
  labels,
  onCancel,
  onFetch,
  onLoad,
  onSaveTest,
  onSync,
  onToggleAutoSync,
  onUpdate,
  onUpload,
  title,
}: CloudCardProps) {
  const [showHelp, setShowHelp] = useState(false);

  const card = (
    <SettingsCard>
      <View className="flex-row items-start justify-between">
        <View style={{ flex: 1, paddingRight: 10 }}>
          <SectionHeader icon="cloud" title={title} description={description} />
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            setShowHelp(true);
          }}
          className="border border-border items-center justify-center"
          style={{ borderRadius: 16, height: 30, width: 30 }}
        >
          <Text className="text-text-primary text-sm font-bold">?</Text>
        </Pressable>
      </View>
      <View
        className="flex-row items-center justify-between border border-border bg-bg-deep mb-3"
        style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text className="text-text-primary text-sm font-semibold">{autoSyncLabel}</Text>
          <Text className="text-text-secondary text-xs mt-1">{autoSyncDescription}</Text>
          <Text className="text-text-muted text-[11px] mt-1">{autoSyncStatusLabel}</Text>
          <Text className="text-text-muted text-[11px] mt-0.5">{autoSyncDetailsLabel}</Text>
        </View>
        <Switch
          accessibilityLabel={autoSyncLabel}
          value={autoSyncEnabled}
          onValueChange={onToggleAutoSync}
          trackColor={{ false: '#2f2f2f', true: '#d8d8d8' }}
          thumbColor={autoSyncEnabled ? '#ffffff' : '#777777'}
          ios_backgroundColor="#2f2f2f"
        />
      </View>
      {!loaded ? (
        <View className="flex-row items-center">
          <Text className="text-text-muted text-xs">{loadLabel}</Text>
          <Feather name="chevron-right" size={14} color="#555" style={{ marginLeft: 4 }} />
        </View>
      ) : (
        <View>
          <CloudField label={labels.accountId} value={form.accountId} onChange={(accountId) => onUpdate({ accountId })} />
          <CloudField label={labels.bucket} value={form.bucket} onChange={(bucket) => onUpdate({ bucket })} />
          <CloudField label={labels.prefix} value={form.prefix} onChange={(prefix) => onUpdate({ prefix })} placeholder="ton" />
          <View className="mb-3">
            <Text className="text-text-secondary text-xs mb-1">{labels.jurisdiction}</Text>
            <View className="flex-row flex-wrap">
              {(['default', 'eu', 'fedramp'] as const).map((jurisdiction) => (
                <CloudPill
                  key={jurisdiction}
                  label={labels[`jurisdiction_${jurisdiction}`]}
                  primary={form.jurisdiction === jurisdiction}
                  onPress={() => onUpdate({ jurisdiction })}
                />
              ))}
            </View>
          </View>
          <CloudField label={labels.accessKeyId} value={form.accessKeyId} onChange={(accessKeyId) => onUpdate({ accessKeyId })} />
          <CloudField
            label={labels.secretAccessKey}
            value={form.secretAccessKey}
            onChange={(secretAccessKey) => onUpdate({ secretAccessKey })}
            placeholder={hasSecret ? labels.secretStored : undefined}
            secure
          />
          <View className="flex-row flex-wrap justify-between" style={{ marginTop: 2 }}>
            <CloudPill gridItem primary disabled={isBusy || !canRun} label={isBusy ? labels.working : labels.saveTest} onPress={onSaveTest} />
            <CloudPill gridItem disabled={isBusy || !canRun} label={labels.uploadMissing} onPress={onUpload} />
            <CloudPill gridItem disabled={isBusy || !canRun} label={labels.fetchLibrary} onPress={onFetch} />
            <CloudPill gridItem disabled={isBusy || !canRun} label={labels.syncNow} onPress={onSync} />
            <CloudPill gridItem disabled={!isBusy} label={labels.cancel} onPress={onCancel} />
          </View>
          {progressLabel && (
            <Text className="text-text-secondary text-xs mt-1">{progressLabel}</Text>
          )}
          {resultLabel && !progress && (
            <Text className="text-text-secondary text-xs mt-1">{resultLabel}</Text>
          )}
          {connectedLabel && !progress && !result && (
            <Text className="text-text-secondary text-xs mt-1">{connectedLabel}</Text>
          )}
          {failedLabel && (
            <Text className="text-red-300 text-xs mt-1">{failedLabel}</Text>
          )}
        </View>
      )}
    </SettingsCard>
  );

  return (
    <>
      {loaded ? card : <Pressable onPress={onLoad}>{card}</Pressable>}
      {showHelp && (
        <CloudHelpModal title={helpTitle} steps={helpSteps} onClose={() => setShowHelp(false)} />
      )}
    </>
  );
}
