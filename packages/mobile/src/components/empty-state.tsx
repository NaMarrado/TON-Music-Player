import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <View
        className="items-center justify-center rounded-full bg-bg-elevated mb-4"
        style={{ width: 80, height: 80 }}
      >
        {icon ?? <Feather name="music" size={32} color="#888" />}
      </View>
      <Text className="text-text-secondary text-sm text-center" style={{ maxWidth: 280, lineHeight: 22 }}>
        {message}
      </Text>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          className="mt-5 px-5 py-2 rounded-full border border-border bg-bg-surface"
        >
          <Text className="text-text-primary text-sm">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
