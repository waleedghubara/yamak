import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { Icon, type IconName } from './ui';

/** شريط التبويبات السفلي بستايل يمك */
export function YamakTabs({ tabs }: { tabs: { name: string; title: string; icon: IconName; iconActive: IconName; hideBar?: boolean }[] }) {
  const { t } = useTranslation();
  // أندرويد 15 وآيفون يرسمون التطبيق تحت شريط النظام السفلي، فنزيد ارتفاع الشريط بمقداره
  // وإلا أزرار النظام تغطي أسماء التبويبات. ولون الخلفية لازم يجي من الثيم مو الافتراضي الأبيض.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarIcon: ({ focused, color }) => <Icon name={focused ? tab.iconActive : tab.icon} color={color as string} size={24} />,
            // شاشة إلها شريط سفلي خاص بيها (شاشة الكابتن الرئيسية)
            ...(tab.hideBar ? { tabBarStyle: { display: 'none' as const } } : null),
          }}
        />
      ))}
    </Tabs>
  );
}
