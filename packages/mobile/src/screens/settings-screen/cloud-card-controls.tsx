import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';

const INPUT_STYLE = {
  borderRadius: 12,
  height: 44,
  lineHeight: 18,
  paddingVertical: 0,
  width: '100%' as const,
};

export function CloudField({
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
  const [revealed, setRevealed] = useState(false);
  return (
    <View className="mb-3">
      <Text className="text-text-secondary text-xs mb-1">{label}</Text>
      <View
        className="flex-row items-center bg-bg-deep border border-border"
        style={INPUT_STYLE}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          className="flex-1 text-text-primary pl-3.5 text-sm"
          style={{ height: 44, lineHeight: 18, paddingVertical: 0 }}
          placeholderTextColor="#555"
          placeholder={placeholder}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          importantForAutofill="no"
          multiline={false}
          numberOfLines={1}
          scrollEnabled={false}
          secureTextEntry={Boolean(secure) && !revealed}
          spellCheck={false}
          textContentType="none"
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => setRevealed((current) => !current)}
            style={{ alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }}
          >
            <Feather name={revealed ? 'eye-off' : 'eye'} size={16} color="#888" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function CloudHelpModal({
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
      <View className="flex-1 items-center justify-center px-5" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}>
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

export function CloudPill({
  danger,
  disabled,
  fullWidth,
  gridItem,
  label,
  onPress,
  primary,
}: {
  disabled?: boolean;
  danger?: boolean;
  fullWidth?: boolean;
  gridItem?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const className = primary
    ? `bg-white items-center justify-center${gridItem ? '' : ' mr-2 mb-2'}`
    : `border items-center justify-center${gridItem ? '' : ' mr-2 mb-2'} ${danger ? 'border-red-500' : 'border-border'}`;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="items-center justify-center"
      style={{
        minHeight: 44,
        marginBottom: gridItem ? 10 : undefined,
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? '100%' : gridItem ? '48%' : undefined,
      }}
    >
      <View
        className={className}
        style={{
          alignSelf: fullWidth || gridItem ? 'stretch' : undefined,
          borderRadius: 18,
          minHeight: 34,
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
      >
        <Text className={primary
          ? 'text-black text-xs font-semibold text-center'
          : danger
            ? 'text-red-400 text-xs font-semibold text-center'
            : 'text-text-secondary text-xs font-semibold text-center'}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function CloudCleanupModal({
  busy,
  labels,
  onAbort,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  labels: Record<string, string>;
  onAbort: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View className="flex-1 items-center justify-center px-5" style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}>
        {!busy && <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />}
        <View className="bg-bg-surface border border-border w-full" style={{ borderRadius: 24, maxWidth: 420, padding: 20 }}>
          <Text className="text-text-primary text-lg font-bold mb-4">{labels.cleanupTitle}</Text>
          <Text className="text-text-primary text-sm mb-2">{labels.cleanupSongs}</Text>
          <Text className="text-text-secondary text-sm mb-2">{labels.cleanupPlaylists}</Text>
          <Text className="text-text-secondary text-sm mb-4">{labels.cleanupSpace}</Text>
          <Text className="text-red-400 text-xs leading-5 mb-5">{labels.cleanupWarning}</Text>
          <View className="flex-row justify-end">
            <Pressable
              onPress={busy ? onAbort : onClose}
              className="border border-border items-center mr-3"
              style={{ borderRadius: 18, paddingHorizontal: 18, paddingVertical: 10 }}
            >
              <Text className="text-text-primary text-[13px] font-semibold">{labels.cancel}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              className="border border-red-500 items-center"
              style={{ borderRadius: 18, backgroundColor: 'rgba(239,68,68,0.12)', opacity: busy ? 0.5 : 1, paddingHorizontal: 18, paddingVertical: 10 }}
            >
              <Text className="text-red-400 text-[13px] font-semibold">
                {busy ? labels.working : labels.cleanupConfirm}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
