import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;

/** customer = تطبيق "يمك" للزبون، captain = تطبيق "يمك كابتن" */
export const VARIANT: 'customer' | 'captain' = extra.variant === 'captain' ? 'captain' : 'customer';
export const IS_CAPTAIN = VARIANT === 'captain';

export const API_URL: string = String(process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://localhost:4000').replace(/\/$/, '');
const styleCfg = String(process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? extra.mapStyleUrl ?? '');
/** ستايل خريطة خاص (اختياري). فارغ أو OpenFreeMap = خريطة يمك من سيرفرنا (أسرع، عبر Cloudflare) */
export const MAP_STYLE_URL: string = styleCfg.includes('tiles.openfreemap.org') ? '' : styleCfg;
export const EAS_PROJECT_ID: string | undefined = extra.eas?.projectId;

/** مركز كركوك (يتحدث من السيرفر عبر /api/config) */
export const KIRKUK_CENTER = { lat: 35.4681, lng: 44.3922 };

/** كل كم ثانية الكابتن يرسل موقعه */
export const CAPTAIN_LOCATION_INTERVAL_MS = 4000;
/** كل كم ثانية نحدث السيارات القريبة بالواجهة الرئيسية */
export const NEARBY_REFRESH_MS = 10000;
