import { TON_DISCORD_URL } from '@ton/core';
import { Linking, Pressable, Text, View } from 'react-native';
import { SectionHeader } from './primitives';

export function CommunityCard({
  title,
  description,
  buttonLabel,
}: {
  title: string;
  description: string;
  buttonLabel: string;
}) {
  return (
    <View
      className="rounded-xl p-4"
      style={{
        backgroundColor: 'rgba(255, 68, 68, 0.07)',
        borderColor: 'rgba(255, 68, 68, 0.78)',
        borderWidth: 1,
      }}
    >
      <SectionHeader icon="message-circle" title={title} description={description} />
      <View className="ml-[38px] items-start">
        <Pressable
          accessibilityRole="link"
          onPress={() => { void Linking.openURL(TON_DISCORD_URL); }}
          className="bg-white rounded-lg px-4 py-2.5 active:opacity-75"
          style={{ borderColor: '#ff4444', borderWidth: 1 }}
        >
          <Text className="text-black text-sm font-semibold">{buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
