import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { EAS_PROJECT_ID } from '../config';
import i18n from '../i18n';
import { api, ApiError } from './api';
import { freshFix, requestLocation, type Fix } from './location';

// ───────── الموقع ─────────

export async function hasLocationPermission() {
  const p = await Location.getForegroundPermissionsAsync();
  return p.granted;
}

export async function requestLocationPermission() {
  return requestLocation();
}

export type { Fix } from './location';

/** موقع الجهاز الحالي: فوري إذا عندنا قراءة حديثة، وإلا ننتظر GPS لحد 6 ثواني. الدقة الضعيفة (أكثر من 60 متر) نطلب من المستخدم يتأكد بالخريطة */
export function currentPosition(): Promise<Fix | null> {
  return freshFix();
}

export const WEAK_GPS_METERS = 60;

// ───────── الإشعارات ─────────

/** إشعار متابعة الرحلة الثابت (أندرويد) — يتحدث بصمت، ما يطلع كإشعار منبثق */
export const TRIP_NOTIFICATION_ID = 'yamak-trip';

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const quiet = n.request.identifier === TRIP_NOTIFICATION_ID;
    return {
      shouldPlaySound: !quiet,
      shouldSetBadge: false,
      shouldShowBanner: !quiet,
      shouldShowList: true,
    };
  },
});

/**
 * قنوات أندرويد:
 *   rides  أعلى أولوية — طلبات ورحلات (منبثق + صوت)
 *   news   عالية — إشعارات الإدارة (عروض وتبليغات) تطلع بالشريط حتى لو التطبيق مسدود
 *   trip   هادئة — متابعة الرحلة (وقت الوصول + الخط) بشاشة القفل والشريط بدون صوت
 */
export async function ensureNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('rides', {
    name: 'Rides',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  // الطلب الجديد: أعلى أولوية + رنة واهتزاز قوي حتى يوصل والتطبيق مسكّر
  await Notifications.setNotificationChannelAsync('offers', {
    name: i18n.t('captain.offersChannel'),
    importance: Notifications.AndroidImportance.MAX,
    sound: 'yamak_ring.wav',
    vibrationPattern: [0, 600, 1400, 600, 1400, 600],
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync('news', {
    name: i18n.t('notifications.title'),
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync('trip', {
    name: i18n.t('live.channel'),
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** يسجل الجهاز لإشعارات Push ويرسل الـ token للسيرفر */
export async function registerForPush() {
  try {
    if (!Device.isDevice) return;
    await ensureNotificationChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = EAS_PROJECT_ID ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return; // لازم مشروع EAS حتى تشتغل الإشعارات (شوف README)
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/api/me/push-token', { body: { token: data } });
  } catch (err) {
    // أندرويد بدون ملف Firebase (google-services.json) يفشل هنا — الإشعارات تظل تطلع بخانة «الإشعارات» داخل التطبيق
    console.warn('push registration failed', err);
  }
}

// ───────── روابط ─────────

export function callPhone(phone: string | null | undefined) {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`);
}

/** 0786 216 2228 / +9647862162228 → 9647862162228 (صيغة رابط واتساب) */
export function waNumber(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '964' + d.slice(1);
  return d;
}

/** يفتح محادثة واتساب ويا الرقم (الكابتن ↔ الزبون، أو الدعم) */
export function openWhatsApp(phone: string | null | undefined, text?: string) {
  if (!phone) return;
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  Linking.openURL(`https://wa.me/${waNumber(phone)}${q}`).catch(() => {});
}

// ───────── الأخطاء ─────────

export function errorText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'unknown_error';
  const key = `errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('errors.unknown_error');
}

export function showError(err: unknown) {
  Alert.alert('', errorText(err));
}
