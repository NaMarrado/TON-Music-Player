import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';
import type { HomeStackParamList } from '../../types/navigation';

interface HomeHeaderProps {
  title: string;
}

export function HomeHeader({ title }: HomeHeaderProps) {
  const topPadding = useScreenTopPadding(16);
  const { t } = useTranslation('profile');
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  return (
    <View className="flex-row items-center justify-between px-4 pb-2" style={{ paddingTop: topPadding }}>
      <Text className="text-white text-2xl font-bold">{title}</Text>
      <Pressable
        onPress={() => navigation.navigate('Profile')}
        accessibilityRole="button"
        accessibilityLabel={t('title')}
        hitSlop={8}
        className="w-10 h-10 rounded-full bg-bg-surface items-center justify-center"
      >
        <Feather name="user" size={18} color="#e8e8e8" />
      </Pressable>
    </View>
  );
}
