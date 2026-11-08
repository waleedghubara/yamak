import type { LngLatArr } from './types';

/**
 * الملاحة داخل تطبيق الكابتن (بدل Waze):
 * السيرفر يرجع المسار الكامل + خطوات المناورة (OSRM)، وهنا نحسب وين الكابتن على المسار،
 * شنو المناورة الجاية وبعدها كم متر، والمتبقي، وإذا طلع عن الطريق.
 */

export interface NavStep {
  type: string;
  modifier: string | null;
  exit: number | null;
  name: string;
  /** بعد المناورة من بداية المسار (متر) */
  atM: number;
  location: LngLatArr;
}

export interface NavRoute {
  rideId: string;
  phase: 'to_pickup' | 'to_destination';
  distanceKm: number;
  durationMin: number;
  geometry: LngLatArr[];
  steps: NavStep[];
  target: { lat: number; lng: number };
}

export interface NavProgress {
  /** بعد الكابتن عن خط المسار (متر) */
  offRouteM: number;
  /** المسافة المقطوعة على المسار (متر) */
  alongM: number;
  remainingM: number;
  remainingMin: number;
  next: NavStep | null;
  /** المسافة لحد المناورة الجاية (متر) */
  toNextM: number;
  /** اتجاه الطريق عند الكابتن (درجة) — للكاميرا لما الـ GPS ما يعطي اتجاه */
  roadBearing: number;
  arrived: boolean;
  /** الباقي من المسار (من مكان الكابتن للهدف) — هذا اللي ينرسم على الخريطة */
  ahead: LngLatArr[];
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** المسافات التراكمية لنقاط المسار */
export function cumulative(geometry: LngLatArr[]): number[] {
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) {
    const [lng1, lat1] = geometry[i - 1];
    const [lng2, lat2] = geometry[i];
    cum.push(cum[i - 1] + distM({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }));
  }
  return cum;
}

/** يسقط موقع الكابتن على أقرب نقطة بالمسار (تقريب مسطح — دقيق داخل المدينة) */
function project(p: { lat: number; lng: number }, geometry: LngLatArr[], cum: number[]) {
  const kx = Math.cos(rad(p.lat)) * 111320;
  const ky = 110540;
  let best = { d: Infinity, along: 0, seg: 0, q: [p.lng, p.lat] as LngLatArr };
  for (let i = 1; i < geometry.length; i++) {
    const [ax0, ay0] = geometry[i - 1];
    const [bx0, by0] = geometry[i];
    const ax = (ax0 - p.lng) * kx;
    const ay = (ay0 - p.lat) * ky;
    const bx = (bx0 - p.lng) * kx;
    const by = (by0 - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d = Math.sqrt(qx * qx + qy * qy);
    if (d < best.d) best = { d, along: cum[i - 1] + t * (cum[i] - cum[i - 1]), seg: i, q: [p.lng + qx / kx, p.lat + qy / ky] };
  }
  return best;
}

export function progress(route: NavRoute, cum: number[], p: { lat: number; lng: number }): NavProgress {
  const g = route.geometry;
  const total = cum[cum.length - 1] || 0;
  const pr = g.length >= 2 ? project(p, g, cum) : { d: distM(p, route.target), along: 0, seg: 1, q: [p.lng, p.lat] as LngLatArr };
  // خطوات OSRM محسوبة على طول الطريق نفسه، فنقارنها بنفس المقياس
  const scale = route.steps.length ? (route.steps[route.steps.length - 1].atM || total) / (total || 1) : 1;
  const alongM = pr.along * scale;
  const totalM = total * scale;
  const next = route.steps.find((s) => s.type !== 'depart' && s.atM > alongM + 3) ?? null;
  const remainingM = Math.max(0, totalM - alongM);
  const [lng1, lat1] = g[Math.max(0, pr.seg - 1)] ?? [p.lng, p.lat];
  const [lng2, lat2] = g[Math.min(g.length - 1, pr.seg)] ?? [route.target.lng, route.target.lat];
  return {
    offRouteM: pr.d,
    alongM,
    remainingM,
    remainingMin: totalM > 0 ? Math.max(0, (route.durationMin * remainingM) / totalM) : 0,
    next,
    toNextM: next ? Math.max(0, next.atM - alongM) : remainingM,
    roadBearing: bearing({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }),
    arrived: distM(p, route.target) < 40 || remainingM < 25,
    ahead: [pr.q, ...g.slice(pr.seg)],
  };
}

/** أيقونة المناورة (MaterialCommunityIcons) */
export function maneuverIcon(s: NavStep | null): string {
  if (!s) return 'arrow-up-bold';
  if (s.type === 'arrive') return 'flag-checkered';
  if (s.type === 'roundabout' || s.type === 'rotary' || s.type === 'roundabout turn' || s.type === 'exit roundabout') return 'rotate-left';
  switch (s.modifier) {
    case 'uturn':
      return 'arrow-u-left-top-bold';
    case 'sharp right':
    case 'right':
      return 'arrow-right-top-bold';
    case 'slight right':
      return 'arrow-top-right-bold-outline';
    case 'sharp left':
    case 'left':
      return 'arrow-left-top-bold';
    case 'slight left':
      return 'arrow-top-left-bold-outline';
    default:
      return 'arrow-up-bold';
  }
}

/** مفتاح الترجمة للمناورة */
export function maneuverKey(s: NavStep | null): { key: string; n?: number } {
  if (!s) return { key: 'nav.turn.straight' };
  if (s.type === 'arrive') return { key: 'nav.arrive' };
  if (s.type === 'depart') return { key: 'nav.depart' };
  if (s.type === 'roundabout' || s.type === 'rotary' || s.type === 'roundabout turn') {
    return s.exit ? { key: 'nav.roundabout', n: s.exit } : { key: 'nav.roundaboutEnter' };
  }
  if (s.type === 'exit roundabout') return { key: 'nav.roundaboutExit' };
  const m: Record<string, string> = {
    uturn: 'uturn',
    'sharp right': 'sharpRight',
    right: 'right',
    'slight right': 'slightRight',
    straight: 'straight',
    'slight left': 'slightLeft',
    left: 'left',
    'sharp left': 'sharpLeft',
  };
  return { key: `nav.turn.${m[s.modifier ?? 'straight'] ?? 'straight'}` };
}

/** 340 م ← 350 م، 1.2 كم */
export function roundDistance(m: number): { v: string; unit: 'm' | 'km' } {
  if (m >= 1000) return { v: (Math.round(m / 100) / 10).toString(), unit: 'km' };
  if (m >= 100) return { v: String(Math.round(m / 50) * 50), unit: 'm' };
  return { v: String(Math.max(0, Math.round(m / 10) * 10)), unit: 'm' };
}
