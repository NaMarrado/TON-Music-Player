import { Text, View } from 'react-native';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';

interface HomeHeaderProps {
  title: string;
}

export function HomeHeader({ title }: HomeHeaderProps) {
  const topPadding = useScreenTopPadding(16);

  return (
    <View className="px-4 pb-2" style={{ paddingTop: topPadding }}>
      <Text className="text-white text-2xl font-bold">{title}</Text>
    </View>
  );
}
