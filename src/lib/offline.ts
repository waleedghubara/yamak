import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { api, ApiError } from './api';
import { storage } from './storage';

/**
 * العمل بدون إنترنت:
 *  1) كاش محلي لآخر بيانات مهمة (الشاشة الرئيسية، الرحلة الحالية) حتى التطبيق يفتح ويشتغل
 *     لو النت أو السيرفر منقطع — بدل شاشة فاضية.
 *  2) طابور إرسال: أي إجراء يفشل بسبب الشبكة ينحفظ وينرسل تلقائياً أول ما يرجع الاتصال،
 *     بنفس Idempotency-Key حتى ما ينفذ مرتين. السيرفر يرفض المتأخر منه (409) فنرميه بدون ضرر.
 *
 * التخزين على expo-secure-store الموجود أصلاً (بدون مكتبات زيادة)، فنخزن لقطات صغيرة
 * (بدون مسار الخريطة والتفاصيل الكبيرة) ونحرس الحجم.
 */

const PREFIX = 'yamak_cache_';
const QUEUE_KEY = 'yamak_outbox';
/** أقصى حجم لأي قيمة (SecureStore على أندرويد ما يضمن أكثر من ~2KB) */
const MAX_BYTES = 1800;
/** الإجراء الأقدم من هذا العمر ما ينرسل (صار متأخر) */
const QUEUE_TTL_MS = 6 * 60 * 60_000;
const MAX_QUEUE = 20;

export interface Cached<T> {
  value: T;
  /** وقت الحفظ (ms) */
  at: number;
}

function size(s: string) {
  return s.length; // تقريب كافي: JSON عندنا ASCII + عربي قليل
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const payload = JSON.stringify({ value, at: Date.now() });
    if (size(payload) > MAX_BYTES) return; // لقطة كبيرة: ما نخزنها بدل ما نكسر التخزين
    await storage.set(PREFIX + key, payload);
  } catch {
    // الكاش اختياري
  }
}

export async function cacheGet<T>(key: string): Promise<Cached<T> | null> {
  const raw = await storage.get(PREFIX + key);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Cached<T>;
    return p && typeof p.at === 'number' ? p : null;
  } catch {
    return null;
  }
}

export async function cacheClear(key: string): Promise<void> {
  await storage.set(PREFIX + key, null);
}

/** يرجع true إذا الخطأ سببه الشبكة أو السيرفر (يستاهل كاش/إعادة محاولة) */
export function isOffline(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'network_error' || err.status >= 500);
}

/**
 * طلب GET مع كاش: يجيب من السيرفر ويحفظ، وإذا النت منقطع يرجع آخر نسخة محفوظة.
 * stale=true يعني البيانات من الكاش (الشاشة تبين علامة «بدون إنترنت»).
 */
export async function getCached<T>(
  path: string,
  key: string,
  opts: { query?: Record<string, string | number | boolean | undefined | null>; shrink?: (v: T) => unknown } = {},
): Promise<{ data: T | null; stale: boolean; at: number | null }> {
  try {
    const data = await api<T>(path, { query: opts.query });
    await cacheSet(key, opts.shrink ? opts.shrink(data) : data);
    return { data, stale: false, at: Date.now() };
  } catch (err) {
    if (!isOffline(err)) throw err;
    const hit = await cacheGet<T>(key);
    return { data: hit?.value ?? null, stale: true, at: hit?.at ?? null };
  }
}

// ───────── طابور الإرسال ─────────

export interface QueuedAction {
  id: string;
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  at: number;
  /** مفتاح يمنع التكرار: الإجراء الجديد بنفس المفتاح يستبدل القديم (مثلاً آخر موقع) */
  dedupe?: string;
  /** وصف قصير للعرض للمستخدم */
  label?: string;
}

let queue: QueuedAction[] | null = null;
let flushing = false;
const listeners = new Set<() => void>();

async function load(): Promise<QueuedAction[]> {
  if (queue) return queue;
  const raw = await storage.get(QUEUE_KEY);
  try {
    queue = raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    queue = [];
  }
  return queue;
}

async function save() {
  try {
    await storage.set(QUEUE_KEY, JSON.stringify(queue ?? []));
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

export function onQueueChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function pendingCount(): number {
  return queue?.length ?? 0;
}

/** يحفظ إجراء فشل بسبب الشبكة حتى ينرسل أول ما يرجع الاتصال */
export async function enqueue(a: Omit<QueuedAction, 'at'>): Promise<void> {
  const q = await load();
  const next = { ...a, at: Date.now() };
  const i = a.dedupe ? q.findIndex((x) => x.dedupe === a.dedupe) : q.findIndex((x) => x.id === a.id);
  if (i >= 0) q[i] = next;
  else q.push(next);
  if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
  await save();
}

/**
 * ينفذ الطلب، وإذا النت منقطع يحفظه بالطابور ويرجع false (التطبيق يكمل ويطمّن المستخدم).
 * الأخطاء الثانية (رفض السيرفر) ترجع للشاشة مثل العادة.
 */
export async function sendOrQueue<T = unknown>(a: Omit<QueuedAction, 'at'>): Promise<T | null> {
  try {
    return await api<T>(a.path, { method: a.method, body: a.body, headers: { 'Idempotency-Key': a.id } });
  } catch (err) {
    if (!isOffline(err)) throw err;
    await enqueue(a);
    return null;
  }
}

/** يرسل الطابور بالترتيب. يوقف أول ما يفشل بسبب الشبكة، ويرمي المرفوض والمتأخر */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const q = await load();
    while (q.length) {
      const a = q[0];
      if (Date.now() - a.at > QUEUE_TTL_MS) {
        q.shift();
        await save();
        continue;
      }
      try {
        await api(a.path, { method: a.method, body: a.body, headers: { 'Idempotency-Key': a.id }, keepSession: true });
      } catch (err) {
        if (isOffline(err)) return; // النت لسه منقطع: نكمل بالمرة الجاية
        // السيرفر رفضه (مثلاً الحالة تغيرت أو الرحلة انتهت): ما ينفذ ثانية
      }
      q.shift();
      await save();
    }
  } finally {
    flushing = false;
  }
}

let watching = false;

/** يشغل المزامنة التلقائية: عند عودة الإنترنت وعند رجوع التطبيق للواجهة */
export function startOfflineSync(): void {
  if (watching) return;
  watching = true;
  NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) flushQueue();
  });
  AppState.addEventListener('change', (st) => {
    if (st === 'active') flushQueue();
  });
  flushQueue();
}
