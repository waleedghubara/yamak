import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { colors } from '../theme';
import { api } from './api';

/**
 * موقع الكابتن بالخلفية: لما يطلع من التطبيق أو يطفي الشاشة، الزبون يظل يشوف السيارة تتحرك.
 *   أندرويد: خدمة أمامية بإشعار ثابت "يمك كابتن — أنت متصل" (ما تحتاج إذن الموقع "دائماً")
 *   آيفون: وضع الموقع بالخلفية + الشريط الأزرق بأعلى الشاشة
 * والتطبيق بالواجهة: watchPositionAsync بشاشة الكابتن يرسل عبر الـ socket، وهذي المهمة ما ترسل شي.
 * وبالخلفية: هذي المهمة ترسل عبر HTTP (POST /api/captain/location).
 */
export const BG_LOCATION_TASK = 'yamak-captain-location';
const MIN_SEND_MS = 4000;
let lastSent = 0;

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(BG_LOCATION_TASK, async ({ data, error }) => {
  if (error || AppState.currentState === 'active') return;
  const l = data?.locations?.[data.locations.length - 1];
  if (!l) return;
  const now = Date.now();
  if (now - lastSent < MIN_SEND_MS) return;
  lastSent = now;
  await api('/api/captain/location', {
    body: {
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
      accuracy: l.coords.accuracy,
    },
    timeoutMs: 8000,
  }).catch(() => {});
});

export async function startBackgroundLocation(texts: { title: string; body: string }): Promise<boolean> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: MIN_SEND_MS,
      distanceInterval: 10,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: texts.title,
        notificationBody: texts.body,
        notificationColor: colors.primary,
        killServiceOnDestroy: true,
      },
    });
    return true;
  } catch (err) {
    console.warn('[bgLocation] start failed', err);
    return false;
  }
}

export async function stopBackgroundLocation() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {
    // ignore
  }
}
