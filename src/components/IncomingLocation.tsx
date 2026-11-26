import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState } from 'react-native';
import { IS_CAPTAIN } from '../config';
import { api } from '../lib/api';
import { freshFix, getFix } from '../lib/location';
import type { Point } from '../lib/types';
import { setPendingBooking } from '../state/placeBus';
import { useAuth } from '../state/auth';

/**
 * موقع منشور بالواتساب يوصل بطريقتين:
 *   1) الزبون يضغط على الرابط ويختار «يمك تكسي» من قائمة الفتح  (deep link)
 *   2) الزبون يضغط «مشاركة/Share» على الرسالة ويختار «يمك تكسي»  (ACTION_SEND / Share Extension)
 * بالحالتين: الانطلاق = موقعه الحالي، والوصول = الموقع المستلم ← تفتح شاشة الطلب بالسعر مباشرة.
 * الروابط المختصرة يفكها السيرفر (GET /api/geo/resolve) بمضيفين مسموحين فقط.
 */
const MAPS_LINK = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+\/maps)/i;
/**
 * geo:35.41,44.42?q=35.41,44.42 — وهاي الصيغة الي يرسلها واتساب.
 * لكن لمن الزبون يضغط على الموقع ويختار «يمك تكسي»، النظام يبدل الـ scheme
 * قبل ما يوصلنا فيصير yamak://35.41,44.42?q=… — فنقبل الاثنين.
 */
const GEO = /^(?:geo:|[a-z][a-z0-9+.-]*:\/\/)(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:.*?[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?))?/i;
/** الرسالة المشارَكة تجي نص فيه كلام + رابط، فنسحب الروابط منها وحدة وحدة */
const ANY_URL = /(?:geo:|https?:\/\/)[^\s<>"'،]+/gi;

function isLocationLink(url: string): boolean {
  return GEO.test(url) || MAPS_LINK.test(url);
}

/** أول رابط موقع داخل نص (أو النص نفسه إذا هو رابط) */
function findLocationLink(text: string): string | null {
  const one = text.trim();
  if (isLocationLink(one)) return one;
  return one.match(ANY_URL)?.find(isLocationLink) ?? null;
}

async function toPoint(url: string): Promise<Point & { inServiceArea?: boolean }> {
  const g = GEO.exec(url);
  if (g) {
    const lat = Number(g[3] ?? g[1]);
    const lng = Number(g[4] ?? g[2]);
    if (lat || lng) return { lat, lng };
  }
  return api<Point & { inServiceArea: boolean }>('/api/geo/resolve', { query: { url } });
}

interface SharedPayload {
  value: string;
  shareType: string;
}

/**
 * قراءة «المشاركة» من تطبيق ثاني — بأمان.
 *
 * ليش ما نستعمل useIncomingShare من expo-sharing مباشرة: أول سطر بيها
 * `useState(getSharedPayloads())` — يعني تنادي الوحدة الأصلية **أثناء أول رسم**
 * وبدون أي حماية. وعلى الآيفون هاي المناداة ترمي استثناء إذا Share Extension
 * مو مبني أو App Group مو مضبوط، واستثناء أثناء الرسم = انهيار قاتل عند الإقلاع.
 * وهذا اللي صار بنسخة 1.4.0: التطبيقين ينغلقان بعد شاشة البداية بجزء من الثانية.
 *
 * هنا المناداة تصير **بعد** الرسم وداخل try/catch: إذا الامتداد موجود تشتغل
 * الميزة عادي، وإذا مو موجود تنطفي بهدوء والتطبيق يكمل شغله.
 */
function useSharedPayloadsSafe() {
  const [payloads, setPayloads] = useState<SharedPayload[]>([]);

  const read = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const payloads = (require('expo-sharing') as typeof import('expo-sharing')).getSharedPayloads();
      setPayloads(payloads as SharedPayload[]);
    } catch {
      setPayloads([]); // الامتداد مو مبني بهذي النسخة — الميزة مطفية بس
    }
  }, []);

  useEffect(() => {
    read();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') read();
    });
    return () => sub.remove();
  }, [read]);

  const clear = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-sharing') as typeof import('expo-sharing')).clearSharedPayloads();
    } catch {
      // ماكو شي ننظفه
    }
    setPayloads([]);
  }, []);

  return { sharedPayloads: payloads, clearSharedPayloads: clear };
}

export function IncomingLocation() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const url = useLinkingURL();
  const { sharedPayloads, clearSharedPayloads } = useSharedPayloadsSafe();
  const handled = useRef<string | null>(null);

  // رابط مباشر من قائمة الفتح
  const fromLink = !IS_CAPTAIN && url && isLocationLink(url) ? url : null;
  // نص مشارَك من واتساب (نص أو رابط)
  const shareText = IS_CAPTAIN
    ? ''
    : (sharedPayloads.find((p) => p.shareType === 'text' || p.shareType === 'url')?.value ?? '');
  const link = fromLink ?? (shareText ? findLocationLink(shareText) : null);

  useEffect(() => {
    if (!token || (!link && !shareText) || handled.current === (link ?? shareText)) return;
    handled.current = link ?? shareText;
    if (shareText) clearSharedPayloads();
    (async () => {
      try {
        if (!link) throw new Error('no_location');
        const dest = await toPoint(link);
        if (dest.inServiceArea === false) {
          Alert.alert('', t('errors.outside_service_area'));
          return;
        }
        // الانطلاق من موقع الزبون الحالي (ننتظر قراءة GPS قصيرة)
        const me = (await freshFix(4000)) ?? getFix();
        setPendingBooking({
          pickup: me ? { lat: me.lat, lng: me.lng } : undefined,
          dropoff: { lat: dest.lat, lng: dest.lng, address: t('linkLoc.shared') },
        });
        router.push({ pathname: '/book', params: { step: me ? 'dropoff' : 'pickup' } });
      } catch {
        // الرابط ما انفك (أو المشارَك ماكو بيه موقع): نفتح الطلب عادي حتى يحدد الوجهة بنفسه
        Alert.alert(t('linkLoc.failedTitle'), t('linkLoc.failedBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('linkLoc.pickManually'), onPress: () => router.push({ pathname: '/book', params: { step: 'pickup' } }) },
        ]);
      }
    })();
  }, [link, shareText, token, t, clearSharedPayloads]);

  return null;
}
