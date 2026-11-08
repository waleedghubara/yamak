import type { Point } from '../lib/types';

/**
 * تمرير المكان المختار من شاشة البحث للشاشة اللي فتحتها.
 * (expo-router ما يرجع نتيجة من شاشة لشاشة، فنستخدم مستمع بسيط)
 */
type Listener = (target: string, place: Point) => void;
const listeners = new Set<Listener>();

export const placeBus = {
  emit(target: string, place: Point) {
    listeners.forEach((l) => l(target, place));
  },
  on(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** "اطلب نفس الرحلة" / مكان محفوظ: بيانات تنتقل لشاشة الحجز */
let pendingBooking: { pickup?: Point; dropoff?: Point; stops?: Point[] } | null = null;
export function setPendingBooking(b: typeof pendingBooking) {
  pendingBooking = b;
}
export function takePendingBooking() {
  const b = pendingBooking;
  pendingBooking = null;
  return b;
}
