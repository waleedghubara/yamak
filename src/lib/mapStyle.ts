import { OfflineManager } from '@maplibre/maplibre-react-native';
import { useState } from 'react';
import { MAP_STYLE_URL } from '../config';
import i18n from '../i18n';
import { getBaseUrl } from './server';

/**
 * ستايل الخريطة يجي من سيرفرنا: https://api.yamaktaxi.com/map/styles/liberty?lang=ar
 *  - السيرفر يعدله لكركوك (الأسماء بلغة التطبيق، أسماء الأحياء أوضح، بدون خط مائل)
 *  - Cloudflare يحفظه هو والبلاطات بسيرفره ببغداد ← الخريطة تفتح بسرعة
 *  - الجهاز نفسه يحفظ الستايل والبلاطات (كاش 150MB + منطقة كركوك محملة مسبقاً)
 *    ← من ثاني مرة الخريطة تطلع فوراً وحتى لو النت ضعيف
 * إذا سيرفرنا ما رد، نرجع لـ OpenFreeMap مباشرة حتى الخريطة تشتغل بكل الأحوال.
 */
type Lang = 'ar' | 'ckb' | 'tk';
const DIRECT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** منطقة كركوك وأطرافها — تتحمل مرة وحدة بالجهاز */
const KIRKUK_BOUNDS: [number, number, number, number] = [44.22, 35.36, 44.56, 35.58];
const PACK_NAME = 'kirkuk-v1';

let failed = false;

function langNow(): Lang {
  const l = i18n.language;
  return l === 'ckb' || l === 'tk' ? l : 'ar';
}

export function mapStyleUrl(lang: Lang = langNow()): string {
  if (MAP_STYLE_URL) return MAP_STYLE_URL;
  return `${getBaseUrl()}/map/styles/liberty?lang=${lang}`;
}

/** رابط الستايل للخريطة + شنو نسوي إذا فشل التحميل */
export function useMapStyle(): { url: string; onFail: () => void } {
  const [bad, setBad] = useState(failed);
  return {
    url: bad ? DIRECT_STYLE : mapStyleUrl(),
    onFail: () => {
      if (bad) return;
      failed = true;
      setBad(true);
    },
  };
}

let started = false;

/**
 * مرة وحدة عند فتح التطبيق: نكبر كاش الخريطة بالجهاز ونحمل منطقة كركوك بالخلفية
 * (بحدود كم ميگابايت، مرة وحدة بس) حتى الخريطة تطلع فوراً.
 */
export async function initMapCache() {
  if (started) return;
  started = true;
  try {
    await OfflineManager.setMaximumAmbientCacheSize(150 * 1024 * 1024);
  } catch {
    // مو مهم
  }
  // ننتظر شوية حتى أول شاشة تخلص تحميل
  setTimeout(async () => {
    try {
      const packs = await OfflineManager.getPacks();
      const pack = packs.find((p) => p.metadata?.name === PACK_NAME);
      if (pack) {
        const st = await pack.status();
        if (st.state !== 'complete') await pack.resume();
        return;
      }
      await OfflineManager.createPack(
        { mapStyle: mapStyleUrl(), bounds: KIRKUK_BOUNDS, minZoom: 10, maxZoom: 14, metadata: { name: PACK_NAME } },
        () => {},
        () => {},
      );
    } catch {
      // نعيد المحاولة بالمرة الجاية
    }
  }, 8000);
}
