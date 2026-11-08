import * as Location from 'expo-location';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import type { Point } from './types';

/**
 * موقع الجهاز — مخزن واحد لكل التطبيق حتى الموقع يطلع فوراً:
 *  1) أول ما يفتح التطبيق ناخذ آخر موقع معروف من الجهاز (فوري، بدون انتظار GPS)
 *  2) بعدها مراقبة GPS مستمرة (كل ثانيتين) طول ما شاشة تحتاج الموقع مفتوحة
 *     — كل قراءة أدق تحدث الخريطة مباشرة
 *  3) التطبيق بالخلفية: المراقبة تتوقف (البطارية). الكابتن عنده تتبع خلفية منفصل (bgLocation)
 */
export interface Fix extends Point {
  accuracy: number | null;
  heading: number | null;
  /** وقت القراءة (ms) */
  at: number;
}

let fix: Fix | null = null;
let granted: boolean | null = null;
/** أندرويد/آيفون: المستخدم اختار "الموقع التقريبي" بدل الدقيق */
let approximate = false;
const listeners = new Set<() => void>();
let sub: Location.LocationSubscription | null = null;
let starting: Promise<void> | null = null;
let users = 0;

function emit() {
  for (const l of listeners) l();
}

function toFix(l: Location.LocationObject): Fix {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy ?? null,
    heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
    at: l.timestamp || Date.now(),
  };
}

function accept(l: Location.LocationObject) {
  const next = toFix(l);
  // قراءة أضعف بكثير من قراءة حديثة (مثلاً من الأبراج بعد GPS): نتجاهلها
  if (
    fix &&
    fix.accuracy != null &&
    next.accuracy != null &&
    next.accuracy > fix.accuracy * 2 + 20 &&
    next.at - fix.at < 15_000
  )
    return;
  fix = next;
  emit();
}

function readPermission(p: Location.LocationPermissionResponse) {
  granted = p.granted;
  approximate = p.granted && (p.android?.accuracy === 'coarse' || p.ios?.accuracy === 'reduced');
}

export function getFix(): Fix | null {
  return fix;
}

export function isApproximate() {
  return approximate;
}

/** فوري: آخر موقع يعرفه الجهاز (إذا الإذن موجود). ما يطلب إذن */
export async function primeLocation(): Promise<Fix | null> {
  try {
    readPermission(await Location.getForegroundPermissionsAsync());
    if (!granted) return fix;
    if (!fix) {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 });
      if (last && !fix) accept(last);
    }
  } catch {
    // الجهاز ما يعطي موقع هسه — المراقبة تكمل
  }
  return fix;
}

/** يطلب الإذن (إذا ما موجود) ويشغل المراقبة. يرجع true إذا الإذن موجود */
export async function requestLocation(): Promise<boolean> {
  try {
    let p = await Location.getForegroundPermissionsAsync();
    if (!p.granted && p.canAskAgain !== false) p = await Location.requestForegroundPermissionsAsync();
    readPermission(p);
    emit();
    if (p.granted) {
      // أندرويد: إذا "دقة الموقع من Google" مطفية يطلع للمستخدم زر تشغيلها
      if (Platform.OS === 'android') await Location.enableNetworkProviderAsync().catch(() => {});
      if (users > 0) startWatch();
    }
    return p.granted;
  } catch {
    return false;
  }
}

function startWatch(): Promise<void> {
  if (sub) return Promise.resolve();
  if (starting) return starting;
  starting = (async () => {
    try {
      await primeLocation();
      if (!granted) return;
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 2 },
        accept,
      );
      if (users > 0 && AppState.currentState !== 'background') sub = s;
      else s.remove();
    } catch {
      // نعيد المحاولة أول ما الشاشة ترجع
    } finally {
      starting = null;
    }
  })();
  return starting;
}

function stopWatch() {
  sub?.remove();
  sub = null;
}

AppState.addEventListener('change', (st) => {
  if (st === 'active') {
    if (users > 0) startWatch();
  } else if (st === 'background') stopWatch();
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * موقعي الحي: يطلع فوراً (آخر موقع معروف) ويتحدث كل ما تجي قراءة GPS أدق.
 * active=false: يرجع آخر قيمة بدون تشغيل GPS.
 */
export function useMyLocation(active = true): { fix: Fix | null; granted: boolean | null; approximate: boolean } {
  const f = useSyncExternalStore(subscribe, getFix);
  const g = useSyncExternalStore(subscribe, () => granted);
  const a = useSyncExternalStore(subscribe, () => approximate);
  useEffect(() => {
    if (!active) return;
    users++;
    startWatch().then(emit);
    return () => {
      users--;
      if (users <= 0) {
        users = 0;
        stopWatch();
      }
    };
  }, [active]);
  return { fix: f, granted: g, approximate: a };
}

/**
 * موقع لمرة وحدة (مثلاً لما الكابتن يصير متصل):
 * قراءة حديثة (أقل من 15 ثانية) ترجع فوراً، وإلا ننتظر قراءة GPS لحد maxWaitMs ونرجع أفضل شي عندنا.
 */
export async function freshFix(maxWaitMs = 6000, goodMeters = 50): Promise<Fix | null> {
  await primeLocation();
  if (!granted) return null;
  const good = (f: Fix | null) => !!f && Date.now() - f.at < 15_000 && (f.accuracy == null || f.accuracy <= goodMeters);
  if (good(fix)) return fix;
  users++;
  startWatch();
  try {
    return await new Promise<Fix | null>((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(fix);
      }, maxWaitMs);
      const off = subscribe(() => {
        if (good(fix)) {
          clearTimeout(timer);
          off();
          resolve(fix);
        }
      });
    });
  } finally {
    users--;
    if (users <= 0) {
      users = 0;
      stopWatch();
    }
  }
}
