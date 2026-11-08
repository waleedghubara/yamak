import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '../theme';
import { Icon, type IconName } from './ui';

/** شريط التبويبات السفلي بستايل يمك */
export function YamakTabs({ tabs }: { tabs: { name: string; title: string; icon: IconName; iconActive: IconName }[] }) {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        tabBarStyle: { borderTopColor: colors.border, height: 64, paddingTop: 6 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarIcon: ({ focused, color }) => <Icon name={focused ? tab.iconActive : tab.icon} color={color as string} size={24} />,
          }}
        />
      ))}
    </Tabs>
  );
}
