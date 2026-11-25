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
import { IncomingLocation } from '../components/IncomingLocation';
import { UpdateScreen, useUpdateRequired } from '../components/UpdateGate';
import { Welcome } from '../components/Welcome';
import { IS_CAPTAIN } from '../config';
import { initLanguage } from '../i18n';
import { registerForPush } from '../lib/device';
import { primeLocation } from '../lib/location';
import { flushQueue, startOfflineSync } from '../lib/offline';
import { initMapCache } from '../lib/mapStyle';
import { loadBaseUrl } from '../lib/server';
import { AppConfigProvider } from '../state/appConfig';
import { AuthProvider, useAuth } from '../state/auth';
import { boot } from '../state/boot';
import { SocketProvider, useSocket } from '../state/socket';
import { colors, isDark } from '../theme';
import { InAppNotice } from '../components/InAppNotice';

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
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <PushAndDeepLinks />
            <IncomingLocation />
            <AppRoutes />
            <NetworkBanner />
            <InAppNotice />
            <WelcomeGate />
          </SocketProvider>
        </AuthProvider>
      </AppConfigProvider>
    </SafeAreaProvider>
  );
}

/** ترحيب قصير فوق كل شي عند أول فتح للتطبيق */
function WelcomeGate() {
  const { me } = useAuth();
  return <Welcome name={me?.user.name} />;
}

/** التحديث الإجباري يسبق كل شي (الإدارة ترفع أقل إصدار من الإعدادات) */
function AppRoutes() {
  const mustUpdate = useUpdateRequired();
  if (mustUpdate) return <UpdateScreen />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="search" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

/** تسجيل الإشعارات بعد الدخول + فتح الرحلة لما المستخدم يضغط على إشعار */
function PushAndDeepLinks() {
  const { token } = useAuth();
  const { reconnects } = useSocket();
  useEffect(() => {
    if (token) registerForPush();
  }, [token]);

  // أي إجراء انحفظ وقت انقطاع النت ينرسل أول ما يرجع الاتصال (أو يرجع السوكت)
  useEffect(() => {
    if (token) startOfflineSync();
  }, [token]);
  useEffect(() => {
    if (token && reconnects) flushQueue();
  }, [token, reconnects]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'broadcast') router.push('/notifications');
      else if (typeof data?.ticketId === 'string') router.push(`/support/${data.ticketId}`);
      else if (IS_CAPTAIN) router.navigate('/(captain)/home');
      else if (typeof data?.rideId === 'string') router.push(`/ride/${data.rideId}`);
    });
    return () => sub.remove();
  }, []);
  return null;
}
