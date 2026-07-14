import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CloudStorageJurisdiction, CloudSyncProgress, CloudSyncResult } from '@ton/core';
import { SettingsCard, SectionHeader } from './primitives';

type CloudForm = {
  accountId: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction: CloudStorageJurisdiction;
};

const INPUT_STYLE = {
  borderRadius: 12,
  height: 44,
  lineHeight: 18,
  paddingVertical: 0,
  width: '100%' as const,
};

function Field({
  label,
  onChange,
  placeholder,
  secure,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  value: string;
}) {
  return (
    <View className="mb-3">
      <Text className="text-text-secondary text-xs mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        className="bg-bg-deep text-text-primary px-3.5 text-sm border border-border"
        style={INPUT_STYLE}
        placeholderTextColor="#555"
        placeholder={placeholder}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        importantForAutofill="no"
        multiline={false}
        numberOfLines={1}
        scrollEnabled={false}
        secureTextEntry={Boolean(secure)}
        spellCheck={false}
        textContentType="none"
      />
    </View>
  );
}

function HelpModal({
  onClose,
  steps,
  title,
}: {
  onClose: () => void;
  steps: string[];
  title: string;
}) {
  const { height } = useWindowDimensions();
  const panelMaxHeight = Math.min(620, Math.floor(height * 0.84));
  const scrollMaxHeight = Math.max(220, panelMaxHeight - 112);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View
          className="bg-bg-surface border border-border w-full"
          style={{ borderRadius: 24, maxHeight: panelMaxHeight, maxWidth: 420, padding: 20 }}
        >
          <Text className="text-text-primary text-lg font-bold mb-4">{title}</Text>
          <ScrollView
            bounces
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: scrollMaxHeight }}
            contentContainerStyle={{ paddingBottom: 4 }}
          >
            {steps.map((step, index) => (
              <View key={step} className="flex-row mb-3">
                <Text className="text-text-primary text-sm font-bold mr-3">{index + 1}.</Text>
                <Text className="text-text-secondary text-sm flex-1">{step}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            className="bg-white items-center mt-2"
            style={{ borderRadius: 20, paddingVertical: 10 }}
            onPress={onClose}
          >
            <Text className="text-black text-[13px] font-semibold">OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Pill({
  disabled,
  gridItem,
  label,
  onPress,
  primary,
}: {
  disabled?: boolean;
  gridItem?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const className = primary
    ? `bg-white items-center justify-center${gridItem ? '' : ' mr-2 mb-2'}`
    : `border border-border items-center justify-center${gridItem ? '' : ' mr-2 mb-2'}`;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={className}
      style={{
        borderRadius: 20,
        minHeight: 40,
        marginBottom: gridItem ? 10 : undefined,
        opacity: disabled ? 0.5 : 1,
        paddingVertical: 9,
        paddingHorizontal: 14,
        width: gridItem ? '48%' : undefined,
      }}
    >
      <Text className={primary ? 'text-black text-[13px] font-semibold text-center' : 'text-text-secondary text-[13px] font-semibold text-center'}>
        {label}
      </Text>
    </Pressable>
  );
}

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
}: {
  autoSyncDescription: string;
  autoSyncDetailsLabel: string;
  autoSyncEnabled: boolean;
  autoSyncLabel: string;
  autoSyncStatusLabel: string;
  canRun: boolean;
  connectedLabel: string | null;
  description: string;
  failedLabel: string | null;
  form: CloudForm;
  hasSecret: boolean;
  helpSteps: string[];
  helpTitle: string;
  isBusy: boolean;
  loaded: boolean;
  loadLabel: string;
  progress: CloudSyncProgress | null;
  progressLabel: string | null;
  result: CloudSyncResult | null;
  resultLabel: string | null;
  labels: Record<string, string>;
  onCancel: () => void;
  onFetch: () => void;
  onLoad: () => void;
  onSaveTest: () => void;
  onSync: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onUpdate: (patch: Partial<CloudForm>) => void;
  onUpload: () => void;
  title: string;
}) {
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
          <Field label={labels.accountId} value={form.accountId} onChange={(accountId) => onUpdate({ accountId })} />
          <Field label={labels.bucket} value={form.bucket} onChange={(bucket) => onUpdate({ bucket })} />
          <Field label={labels.prefix} value={form.prefix} onChange={(prefix) => onUpdate({ prefix })} placeholder="ton" />
          <View className="mb-3">
            <Text className="text-text-secondary text-xs mb-1">{labels.jurisdiction}</Text>
            <View className="flex-row flex-wrap">
              {(['default', 'eu', 'fedramp'] as const).map((jurisdiction) => (
                <Pill
                  key={jurisdiction}
                  label={labels[`jurisdiction_${jurisdiction}`]}
                  primary={form.jurisdiction === jurisdiction}
                  onPress={() => onUpdate({ jurisdiction })}
                />
              ))}
            </View>
          </View>
          <Field label={labels.accessKeyId} value={form.accessKeyId} onChange={(accessKeyId) => onUpdate({ accessKeyId })} />
          <Field
            label={labels.secretAccessKey}
            value={form.secretAccessKey}
            onChange={(secretAccessKey) => onUpdate({ secretAccessKey })}
            placeholder={hasSecret ? labels.secretStored : undefined}
            secure
          />
          <View className="flex-row flex-wrap justify-between" style={{ marginTop: 2 }}>
            <Pill gridItem primary disabled={isBusy || !canRun} label={isBusy ? labels.working : labels.saveTest} onPress={onSaveTest} />
            <Pill gridItem disabled={isBusy || !canRun} label={labels.uploadMissing} onPress={onUpload} />
            <Pill gridItem disabled={isBusy || !canRun} label={labels.fetchLibrary} onPress={onFetch} />
            <Pill gridItem disabled={isBusy || !canRun} label={labels.syncNow} onPress={onSync} />
            <Pill gridItem disabled={!isBusy} label={labels.cancel} onPress={onCancel} />
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
        <HelpModal title={helpTitle} steps={helpSteps} onClose={() => setShowHelp(false)} />
      )}
    </>
  );
}
