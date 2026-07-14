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
      <Text className={primary
        ? 'text-black text-[13px] font-semibold text-center'
        : 'text-text-secondary text-[13px] font-semibold text-center'}>
        {label}
      </Text>
    </Pressable>
  );
}
