import {
  useFonts,
  Vazirmatn_400Regular,
  Vazirmatn_500Medium,
  Vazirmatn_700Bold,
  Vazirmatn_800ExtraBold,
  Vazirmatn_900Black,
} from '@expo-google-fonts/vazirmatn';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NetworkBanner } from '../components/common';
import { IS_CAPTAIN } from '../config';
import { initLanguage } from '../i18n';
import { registerForPush } from '../lib/device';
import { primeLocation } from '../lib/location';
import { initMapCache } from '../lib/mapStyle';
import { loadBaseUrl } from '../lib/server';
import { AppConfigProvider } from '../state/appConfig';
import { AuthProvider, useAuth } from '../state/auth';
import { boot } from '../state/boot';
import { SocketProvider } from '../state/socket';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Vazirmatn_400Regular,
    Vazirmatn_500Medium,
    Vazirmatn_700Bold,
    Vazirmatn_800ExtraBold,
    Vazirmatn_900Black,
  });
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    // آخر موقع معروف من أول لحظة — حتى الخريطة تفتح على مكانك مباشرة
    if (Platform.OS !== 'web') primeLocation();
    Promise.all([initLanguage(), loadBaseUrl()])
      .then(([chosen]) => {
        boot.langChosen = chosen;
        if (Platform.OS !== 'web') initMapCache();
      })
      .finally(() => setLangReady(true));
  }, []);

  if (!fontsLoaded || !langReady) return null;

  return (
    <SafeAreaProvider>
      <AppConfigProvider>
        <AuthProvider>
          <SocketProvider>
            <StatusBar style="dark" />
            <PushAndDeepLinks />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="search" options={{ presentation: 'modal' }} />
            </Stack>
            <NetworkBanner />
          </SocketProvider>
        </AuthProvider>
      </AppConfigProvider>
    </SafeAreaProvider>
  );
}

/** تسجيل الإشعارات بعد الدخول + فتح الرحلة لما المستخدم يضغط على إشعار */
function PushAndDeepLinks() {
  const { token } = useAuth();
  useEffect(() => {
    if (token) registerForPush();
  }, [token]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as Record<string, unknown>;
      if (typeof data?.ticketId === 'string') router.push(`/support/${data.ticketId}`);
      else if (IS_CAPTAIN) router.navigate('/(captain)/home');
      else if (typeof data?.rideId === 'string') router.push(`/ride/${data.rideId}`);
    });
    return () => sub.remove();
  }, []);
  return null;
}
