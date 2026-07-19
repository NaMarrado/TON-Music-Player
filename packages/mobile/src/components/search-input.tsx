import {
  View,
  TextInput,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search...',
  autoFocus = false,
  style,
}: SearchInputProps) {
  return (
    <View
      className="flex-row items-center bg-bg-elevated px-3.5 h-10"
      style={[{ borderRadius: 20, marginHorizontal: 16 }, style]}
    >
      <Feather name="search" size={16} color="#555" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#555"
        className="flex-1 ml-2 text-text-primary text-sm"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        autoFocus={autoFocus}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Feather name="x" size={16} color="#888" />
        </Pressable>
      )}
    </View>
  );
}
