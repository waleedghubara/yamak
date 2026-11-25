import { api } from './api';
import { cacheGet, cacheSet, isOffline } from './offline';
import type { Ride, RideStatus, SavedPlace } from './types';

/**
 * بيانات الشاشة الرئيسية بطلب واحد (GET /api/me/home) بدل أربعة طلبات.
 * تنحفظ لقطة صغيرة بالجهاز: لو النت أو السيرفر منقطع الشاشة تفتح من اللقطة وتبين «بدون إنترنت».
 */
export interface HomeFeed {
  activeRide: Ride | null;
  pendingRating: Ride | null;
  unread: number;
  places: SavedPlace[];
}

/** اللقطة المحفوظة: بس اللي تحتاجه الشاشة (بدون مسار الخريطة والتفاصيل الكبيرة) */
interface HomeSnapshot {
  ride: { id: string; status: RideStatus } | null;
  unread: number;
  places: SavedPlace[];
}

const KEY = 'home';

export async function loadHomeFeed(): Promise<{ feed: HomeFeed; stale: boolean; at: number | null }> {
  try {
    const feed = await api<HomeFeed>('/api/me/home');
    const snap: HomeSnapshot = {
      ride: feed.activeRide ? { id: feed.activeRide.id, status: feed.activeRide.status } : null,
      unread: feed.unread,
      places: feed.places.slice(0, 6),
    };
    await cacheSet(KEY, snap);
    return { feed, stale: false, at: Date.now() };
  } catch (err) {
    if (!isOffline(err)) throw err;
    const hit = await cacheGet<HomeSnapshot>(KEY);
    const s = hit?.value;
    return {
      feed: {
        // الرحلة من اللقطة: رقمها وحالتها بس — تكفي لبانر «رحلتك الحالية»
        activeRide: s?.ride ? ({ id: s.ride.id, status: s.ride.status } as Ride) : null,
        pendingRating: null,
        unread: s?.unread ?? 0,
        places: s?.places ?? [],
      },
      stale: true,
      at: hit?.at ?? null,
    };
  }
}
