import type { ConfigContext, ExpoConfig } from 'expo/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * الإعدادات اللي تتغير قبل البناء موجودة بملف واحد: yamak.config.json
 *   apiUrl               عنوان السيرفر (للتجربة: IP الكمبيوتر بالشبكة، للإطلاق: https://api.yamak.iq)
 *   mapStyleUrl          ستايل الخريطة
 *   easProjectIdCustomer / easProjectIdCaptain   معرف مشروع EAS لكل تطبيق
 * (متغيرات البيئة EXPO_PUBLIC_API_URL و EXPO_PUBLIC_MAP_STYLE_URL تغلب عليه إذا موجودة)
 */
const file = JSON.parse(readFileSync(path.join(__dirname, 'yamak.config.json'), 'utf8')) as {
  apiUrl: string;
  mapStyleUrl: string;
  easProjectIdCustomer: string;
  easProjectIdCaptain: string;
};

/**
 * تطبيقين من نفس الكود:
 *   APP_VARIANT=customer  ← "يمك" (تطبيق الزبون)
 *   APP_VARIANT=captain   ← "يمك كابتن" (تطبيق الكابتن)
 * كل واحد ينزل بالمتجر كتطبيق مستقل (bundle id مختلف).
 */
const VARIANT = process.env.APP_VARIANT === 'captain' ? 'captain' : 'customer';
const CAPTAIN = VARIANT === 'captain';
const BRAND = '#6323AF';

const API_URL = process.env.EXPO_PUBLIC_API_URL || file.apiUrl;
const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL || file.mapStyleUrl;
const PROJECT_ID = (CAPTAIN ? file.easProjectIdCaptain : file.easProjectIdCustomer) || process.env.EAS_PROJECT_ID || '';
// أندرويد يمنع http العادي بالنسخ النهائية — نسمح بيه فقط إذا السيرفر بدون https (للتجربة على الشبكة المحلية)
const ALLOW_HTTP = API_URL.startsWith('http://');
// إشعارات أندرويد تحتاج ملف Firebase: ينحط بنفس المجلد باسم google-services.json (يشتغل للتطبيقين)
const GOOGLE_SERVICES = existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined;
/**
 * امتدادات الآيفون (App Extensions) — **مطفية افتراضياً**.
 *
 * كل امتداد ينبني ببرنامج وتوقيع مستقل، والمشاركة تحتاج App Group مسجّل بحساب أبل.
 * نسخة 1.4.0 سقطت لأن هذي المتطلبات ما انضبطت عند البناء. ما كو داعي نخاطر بيها:
 * التطبيق يشتغل كامل بدونها، والميزتان المتأثرتان ثانويتان على الآيفون فقط.
 *
 * تشغيلها وقت البناء (بعد ما يتأكدون من التوقيع و App Group):
 *   LIVE_ACTIVITY=1       متابعة الرحلة على شاشة القفل والـ Dynamic Island
 *   SHARING_EXTENSION=1   «مشاركة» موقع من الواتساب لتطبيق يمك — على الآيفون
 *
 * مهم: الإطفاء يخص **الآيفون فقط**. مشاركة الموقع على أندرويد تضل شغالة دائماً،
 * ومعها فتح روابط المواقع (geo: وروابط خرائط كوكل) على النظامين — هذي ما تحتاج امتداد.
 * وكذلك الإطفاء آمن تماماً من 1.4.3: قراءة المشارَك صارت محمية، فالتطبيق ما ينهار
 * إذا الامتداد ناقص (شوف src/components/IncomingLocation.tsx).
 */
// معرّف التطبيق على آبل — حساب الشركة الناشرة. IOS_BUNDLE_IDENTIFIER يغلب عليه إذا موجود
const IOS_BUNDLE_IDENTIFIER =
  process.env.IOS_BUNDLE_IDENTIFIER ||
  (CAPTAIN ? 'com.waleedghubara.yamak.captain' : 'com.waleedghubara.yamak.customer');

const LIVE_ACTIVITY = !CAPTAIN && process.env.LIVE_ACTIVITY === '1';
const IOS_SHARE_EXTENSION = !CAPTAIN && process.env.SHARING_EXTENSION === '1';
const LOCATION_TEXT = CAPTAIN
  ? 'يمك كابتن يستخدم موقعك وانت متصل أو بالرحلة، حتى لو التطبيق بالخلفية أو الشاشة مطفية، حتى يوصلك أقرب الطلبات ويتابع الزبون وصولك ويشتغل دليل الطريق.'
  : 'يمك يحتاج موقعك حتى يحدد نقطة الانطلاق ويوصلك أقرب كابتن.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // الاسم تحت الأيقونة وبالمتاجر (اسم «يمك» وحده محجوز بمتجر أبل لتطبيق ثاني)
  name: CAPTAIN ? 'يمك كابتن' : 'يمك تكسي',
  slug: CAPTAIN ? 'yamak-captain' : 'yamak',
  scheme: CAPTAIN ? 'yamakcaptain' : 'yamak',
  version: '1.4.4',
  orientation: 'portrait',
  icon: CAPTAIN ? './assets/icon-captain.png' : './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      // «افتح بتطبيق ملاحة»: نفحص المثبت منها بـ canOpenURL (شرط آيفون)
      LSApplicationQueriesSchemes: ['maps', 'comgooglemaps', 'waze'],
      ...(ALLOW_HTTP ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
    },
    // أسباب استخدام واجهات iOS الحساسة (شرط App Store) — لمكتبات React Native الأساسية
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
    },
  },
  android: {
    package: CAPTAIN ? 'iq.yamak.captain' : 'iq.yamak.app',
    ...(GOOGLE_SERVICES ? { googleServicesFile: GOOGLE_SERVICES } : {}),
    adaptiveIcon: {
      foregroundImage: CAPTAIN ? './assets/adaptive-foreground-captain.png' : './assets/adaptive-foreground.png',
      backgroundImage: CAPTAIN ? './assets/adaptive-background-captain.png' : './assets/adaptive-background.png',
      backgroundColor: BRAND,
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    predictiveBackGestureEnabled: false,
    // موقع منشور بالواتساب: «يمك تكسي» يطلع بقائمة الفتح (تطبيق الزبون بس)
    ...(CAPTAIN
      ? {}
      : {
          intentFilters: [
            { action: 'VIEW', category: ['DEFAULT', 'BROWSABLE'], data: [{ scheme: 'geo' }] },
            {
              action: 'VIEW',
              category: ['DEFAULT', 'BROWSABLE'],
              data: [
                { scheme: 'https', host: 'maps.app.goo.gl' },
                { scheme: 'https', host: 'maps.google.com' },
                { scheme: 'https', host: 'www.google.com', pathPrefix: '/maps' },
              ],
            },
          ],
        }),
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-localization', { supportsRTL: true }],
    [
      'expo-splash-screen',
      { image: './assets/splash.png', backgroundColor: BRAND, imageWidth: 220, resizeMode: 'contain' },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_TEXT,
        locationAlwaysAndWhenInUsePermission: LOCATION_TEXT,
        locationAlwaysPermission: LOCATION_TEXT,
        // الكابتن: الموقع يستمر بالخلفية طول ما هو متصل أو بالرحلة (التطبيق بالخلفية أو الشاشة مطفية)
        //   آيفون: UIBackgroundModes=location + الشريط الأزرق — أندرويد: خدمة أمامية بإشعار، بدون إذن "دائماً"
        ...(CAPTAIN ? { isIosBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true } : {}),
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'يمك يحتاج الوصول للصور حتى تختار صورتك والمستمسكات وصورة الطلب.',
        cameraPermission: 'يمك يحتاج الكاميرا حتى تصور المستمسكات وصورة الطلب ووصل التسديد.',
        microphonePermission: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: BRAND,
        // رنة الطلب الجديد لقناة offers (الكابتن بس) — 12 ثانية بنمط رنين المكالمة
        ...(CAPTAIN ? { sounds: ['./assets/yamak_ring.wav'] } : {}),
        enableRemoteNotifications: true,
        enableBackgroundRemoteNotifications: false,
      },
    ],
    // «مشاركة» موقع من الواتساب إلى «يمك تكسي» مباشرة (تطبيق الزبون بس).
    // أندرويد يضل شغال دائماً؛ الآيفون يحتاج Share Extension + App Group فيتطفي افتراضياً.
    ...(CAPTAIN
      ? []
      : [
          [
            'expo-sharing',
            {
              android: { enabled: true, singleShareMimeTypes: ['text/plain'] },
              ios: IOS_SHARE_EXTENSION
                ? { enabled: true, activationRule: { supportsText: true, supportsWebUrlWithMaxCount: 1 } }
                : { enabled: false },
            },
          ] as [string, Record<string, unknown>],
        ]),
    ...(LIVE_ACTIVITY ? ['expo-live-activity'] : []),
    '@maplibre/maplibre-react-native',
    ['expo-build-properties', { android: { usesCleartextTraffic: ALLOW_HTTP } }],
  ],
  extra: {
    variant: VARIANT,
    apiUrl: API_URL,
    mapStyleUrl: MAP_STYLE_URL,
    ...(PROJECT_ID ? { eas: { projectId: PROJECT_ID } } : {}),
  },
});
