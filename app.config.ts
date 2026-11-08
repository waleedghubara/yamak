import type { ConfigContext, ExpoConfig } from 'expo/config';
import { readFileSync } from 'node:fs';
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
const LOCATION_TEXT = CAPTAIN
  ? 'يمك كابتن يستخدم موقعك وانت متصل أو بالرحلة، حتى لو التطبيق بالخلفية أو الشاشة مطفية، حتى يوصلك أقرب الطلبات ويتابع الزبون وصولك ويشتغل دليل الطريق.'
  : 'يمك يحتاج موقعك حتى يحدد نقطة الانطلاق ويوصلك أقرب كابتن.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // الاسم تحت الأيقونة وبالمتاجر (اسم «يمك» وحده محجوز بمتجر أبل لتطبيق ثاني)
  name: CAPTAIN ? 'يمك كابتن' : 'يمك تكسي',
  slug: CAPTAIN ? 'yamak-captain' : 'yamak',
  scheme: CAPTAIN ? 'yamakcaptain' : 'yamak',
  version: '1.2.0',
  orientation: 'portrait',
  icon: CAPTAIN ? './assets/icon-captain.png' : './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: CAPTAIN ? 'iq.yamak.captain' : 'iq.yamak.app',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
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
    adaptiveIcon: {
      foregroundImage: CAPTAIN ? './assets/adaptive-foreground-captain.png' : './assets/adaptive-foreground.png',
      backgroundImage: CAPTAIN ? './assets/adaptive-background-captain.png' : './assets/adaptive-background.png',
      backgroundColor: BRAND,
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    predictiveBackGestureEnabled: false,
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
    ['expo-notifications', { icon: './assets/notification-icon.png', color: BRAND }],
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
