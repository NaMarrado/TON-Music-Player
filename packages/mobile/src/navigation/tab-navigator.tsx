import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TabParamList } from '../types/navigation';
import { HomeStack } from './home-stack';
import { SearchStack } from './search-stack';
import { LibraryStack } from './library-stack';
import { DownloadsStack } from './downloads-stack';
import { SettingsStack } from './settings-stack';
import { MiniPlayer } from '../components/mini-player';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getTabPerformanceOptions } from './tab-performance';

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  HomeTab: 'home',
  SearchTab: 'search',
  LibraryTab: 'music',
  DownloadsTab: 'download',
  SettingsTab: 'settings',
};

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ backgroundColor: '#0a0a0a' }}>
      <MiniPlayer />
      <View
        style={{
          flexDirection: 'row',
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(255,255,255,0.08)',
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const isFocused = state.index === index;
          const iconName = TAB_ICONS[route.name] || 'circle';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}
            >
              <Feather
                name={iconName}
                size={20}
                color={isFocused ? '#ffffff' : '#666666'}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: isFocused ? '600' : '400',
                  color: isFocused ? '#ffffff' : '#666666',
                  marginTop: 3,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
              {isFocused && (
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: '#ffffff',
                    marginTop: 3,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function TabNavigator() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={({ route }) => getTabPerformanceOptions(route.name as keyof TabParamList)}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: t('home:tabLabel') }} />
      <Tab.Screen name="SearchTab" component={SearchStack} options={{ title: t('search:tabLabel') }} />
      <Tab.Screen name="LibraryTab" component={LibraryStack} options={{ title: t('library:tabLabel') }} />
      <Tab.Screen name="DownloadsTab" component={DownloadsStack} options={{ title: t('downloads:tabLabel') }} />
      <Tab.Screen name="SettingsTab" component={SettingsStack} options={{ title: t('settings:tabLabel') }} />
    </Tab.Navigator>
  );
}
