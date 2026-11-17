import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors } from '../theme';
import { ensureNotificationChannels, TRIP_NOTIFICATION_ID } from './device';
import { storage } from './storage';

/**
 * متابعة الرحلة خارج التطبيق (مثل أوبر): وقت وصول الكابتن ويا خط يتعبّى
 *   آيفون (16.2+): Live Activity على شاشة القفل والـ Dynamic Island — الخط والعداد يمشون وحدهم لحد وقت الوصول
 *   أندرويد: إشعار ثابت هادئ بشاشة القفل والشريط الأعلى — يتحدث ويا كل تحديث للرحلة
 */

type LiveActivityModule = typeof import('expo-live-activity');
let LA: LiveActivityModule | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    LA = require('expo-live-activity') as LiveActivityModule;
  } catch {
    LA = null;
  }
}

export interface TripStatus {
  rideId: string;
  /** مرحلة الرحلة: لما تتغير يبدي الخط من جديد */
  stage: 'searching' | 'to_pickup' | 'arrived' | 'to_destination';
  title: string;
  subtitle: string;
  /** وقت الوصول المتوقع (ms) — الخط يتعبّى لحده */
  endsAt: number | null;
}

let activityId: string | null = null;
let activityRide: string | null = null;
// نحفظ رقم الـ Live Activity حتى لو التطبيق انسد وانفتح نكمل نفسها (أو نسدها) بدل ما تبقى معلقة
const STORE_KEY = 'yamak_live_activity';
let restored = false;
async function restore() {
  if (restored) return;
  restored = true;
  const v = await storage.get(STORE_KEY);
  if (v && !activityId) {
    const [rid, id] = v.split('|');
    if (rid && id) {
      activityRide = rid;
      activityId = id;
    }
  }
}
let stageKey = '';
let stageStart = 0;
let stageEnd = 0;
let lastSig = '';

const BAR = 12;
function textBar(p: number) {
  const n = Math.round(Math.max(0, Math.min(1, p)) * BAR);
  return '▰'.repeat(n) + '▱'.repeat(BAR - n);
}

function progressOf(s: TripStatus): number {
  if (s.stage === 'arrived') return 1;
  if (s.stage === 'searching' || !s.endsAt) return 0;
  const total = Math.max(60_000, stageEnd - stageStart);
  return Math.max(0, Math.min(0.98, (Date.now() - stageStart) / total));
}

const CONFIG = {
  backgroundColor: colors.primaryDark,
  titleColor: '#FFFFFF',
  subtitleColor: '#E7DAF7',
  progressViewTint: '#FFC629',
  progressViewLabelColor: '#FFFFFF',
  timerType: 'digital' as const,
  imagePosition: 'right' as const,
  imageSize: { width: 44, height: 44 },
  contentFit: 'contain' as const,
};

/** يعرض أو يحدّث متابعة الرحلة. آمن تنادي عليه ويا كل تحديث — ما يكرر نفس الحالة */
export async function showTripStatus(s: TripStatus) {
  const key = `${s.rideId}:${s.stage}`;
  if (key !== stageKey) {
    stageKey = key;
    stageStart = Date.now();
    stageEnd = s.endsAt ?? 0;
  } else if (s.endsAt) {
    stageEnd = s.endsAt;
  }
  // نحدث بس إذا تغير شي يبين (الدقيقة، العنوان، المرحلة)
  const sig = `${key}|${s.title}|${s.subtitle}|${s.endsAt ? Math.round(s.endsAt / 30_000) : 0}`;
  if (sig === lastSig) return;
  lastSig = sig;

  try {
    if (Platform.OS === 'ios') {
      if (!LA) return;
      await restore();
      const state = {
        title: s.title,
        subtitle: s.subtitle,
        progressBar: s.endsAt && s.stage !== 'arrived' ? { date: s.endsAt } : { progress: progressOf(s) },
        imageName: 'yamak_logo',
        dynamicIslandImageName: 'yamak_logo',
      };
      if (activityId && activityRide === s.rideId) {
        LA.updateActivity(activityId, state);
      } else {
        if (activityId) LA.stopActivity(activityId, state);
        const id = LA.startActivity(state, { ...CONFIG, deepLinkUrl: `/ride/${s.rideId}` });
        activityId = id || null;
        activityRide = id ? s.rideId : null;
        await storage.set(STORE_KEY, id ? `${s.rideId}|${id}` : null);
      }
      return;
    }
    if (Platform.OS === 'android') {
      await ensureNotificationChannels();
      await Notifications.scheduleNotificationAsync({
        identifier: TRIP_NOTIFICATION_ID,
        content: {
          title: s.title,
          body: `${textBar(progressOf(s))}   ${s.subtitle}`,
          data: { rideId: s.rideId },
          sound: false,
          sticky: true,
          autoDismiss: false,
          color: colors.primary,
          priority: Notifications.AndroidNotificationPriority.LOW,
        },
        trigger: { channelId: 'trip' },
      });
    }
  } catch (err) {
    console.warn('trip status failed', err);
  }
}

/** ينهي متابعة الرحلة (اكتملت، انلغت، أو ماكو رحلة فعالة) */
export async function clearTripStatus(final?: { title: string; subtitle: string }, rideId?: string) {
  // فتح رحلة قديمة من السجل ما يسد متابعة رحلة ثانية شغالة هسه
  if (Platform.OS === 'ios') await restore();
  const tracked = activityRide ?? (stageKey ? stageKey.split(':')[0] : null);
  if (rideId && tracked && tracked !== rideId) return;
  stageKey = '';
  lastSig = '';
  try {
    if (Platform.OS === 'ios') {
      await restore();
      if (LA && activityId) {
        LA.stopActivity(activityId, { title: final?.title ?? '', subtitle: final?.subtitle, progressBar: { progress: 1 } });
      }
      activityId = null;
      activityRide = null;
      await storage.set(STORE_KEY, null);
      return;
    }
    if (Platform.OS === 'android') await Notifications.dismissNotificationAsync(TRIP_NOTIFICATION_ID);
  } catch {
    // ignore
  }
}
