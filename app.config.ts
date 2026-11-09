
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Yamak App Configuration
 *
 * APP_VARIANT:
 * customer = Yamak Customer
 * captain  = Yamak Captain
 *
 * iOS Bundle IDs:
 * Customer: com.waleedghubara.yamak.customer
 * Captain:  com.waleedghubara.yamak.captain
 */

const file = JSON.parse(
  readFileSync(path.join(__dirname, 'yamak.config.json'), 'utf8')
) as {
  apiUrl: string;
  mapStyleUrl: string;
  easProjectIdCustomer: string;
  easProjectIdCaptain: string;
};

const VARIANT =
  process.env.APP_VARIANT === 'captain'
    ? 'captain'
    : 'customer';

const CAPTAIN = VARIANT === 'captain';

const BRAND = '#6323AF';

// ==========================================
// ENVIRONMENT CONFIGURATION
// ==========================================

const API_URL =
  process.env.EXPO_PUBLIC_API_URL || file.apiUrl;

const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL || file.mapStyleUrl;

const PROJECT_ID =
  (CAPTAIN
    ? file.easProjectIdCaptain
    : file.easProjectIdCustomer) ||
  process.env.EAS_PROJECT_ID ||
  '';

// ==========================================
// APPLICATION IDENTIFIERS
// ==========================================

const IOS_BUNDLE_IDENTIFIER =
  process.env.IOS_BUNDLE_IDENTIFIER ||
  (CAPTAIN
    ? 'com.waleedghubara.yamak.captain'
    : 'com.waleedghubara.yamak.customer');

// Preserve existing Android package identifiers.
// Do not change these without checking Google Play.

const ANDROID_PACKAGE = CAPTAIN
  ? 'iq.yamak.captain'
  : 'iq.yamak.app';

// ==========================================
// PLATFORM CONFIGURATION
// ==========================================

const ALLOW_HTTP = API_URL.startsWith('http://');

const LOCATION_TEXT = CAPTAIN
  ? 'يمك كابتن يستخدم موقعك وانت متصل أو بالرحلة، حتى لو التطبيق بالخلفية أو الشاشة مطفية، حتى يوصلك أقرب الطلبات ويتابع الزبون وصولك ويشتغل دليل الطريق.'
  : 'يمك يحتاج موقعك حتى يحدد نقطة الانطلاق ويوصلك أقرب كابتن.';

// ==========================================
// EXPO CONFIG
// ==========================================

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  name: CAPTAIN ? 'يمك كابتن' : 'يمك تكسي',

  slug: CAPTAIN ? 'yamak-captain' : 'yamak',

  scheme: CAPTAIN ? 'yamakcaptain' : 'yamak',

  version: '1.2.0',

  orientation: 'portrait',

  icon: CAPTAIN
    ? './assets/icon-captain.png'
    : './assets/icon.png',

  userInterfaceStyle: 'light',

  // ========================================
  // IOS
  // ========================================

  ios: {
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,

    supportsTablet: false,

    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,

      CFBundleAllowMixedLocalizations: true,

      ...(ALLOW_HTTP
        ? {
            NSAppTransportSecurity: {
              NSAllowsArbitraryLoads: true,
            },
          }
        : {}),
    },

    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType:
            'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType:
            'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType:
            'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType:
            'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },

  // ========================================
  // ANDROID
  // ========================================

  android: {
    package: ANDROID_PACKAGE,

    adaptiveIcon: {
      foregroundImage: CAPTAIN
        ? './assets/adaptive-foreground-captain.png'
        : './assets/adaptive-foreground.png',

      backgroundImage: CAPTAIN
        ? './assets/adaptive-background-captain.png'
        : './assets/adaptive-background.png',

      backgroundColor: BRAND,
    },

    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'CAMERA',
    ],

    predictiveBackGestureEnabled: false,
  },

  // ========================================
  // EXPO PLUGINS
  // ========================================

  plugins: [
    'expo-router',

    'expo-font',

    'expo-secure-store',

    [
      'expo-localization',
      {
        supportsRTL: true,
      },
    ],

    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        backgroundColor: BRAND,
        imageWidth: 220,
        resizeMode: 'contain',
      },
    ],

    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_TEXT,

        locationAlwaysAndWhenInUsePermission: LOCATION_TEXT,

        locationAlwaysPermission: LOCATION_TEXT,

        ...(CAPTAIN
          ? {
              isIosBackgroundLocationEnabled: true,
              isAndroidForegroundServiceEnabled: true,
            }
          : {}),
      },
    ],

    [
      'expo-image-picker',
      {
        photosPermission:
          'يمك يحتاج الوصول للصور حتى تختار صورتك والمستمسكات وصورة الطلب.',

        cameraPermission:
          'يمك يحتاج الكاميرا حتى تصور المستمسكات وصورة الطلب ووصل التسديد.',

        microphonePermission: false,
      },
    ],

    // Push Notifications - APNs / iOS / FCM
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: BRAND,

        // Required for remote push notifications on iOS.
        enableRemoteNotifications: true,

        // Keep disabled unless silent background push is required.
        enableBackgroundRemoteNotifications: false,
      },
    ],

    '@maplibre/maplibre-react-native',

    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: ALLOW_HTTP,
        },
      },
    ],
  ],

  // ========================================
  // EXTRA
  // ========================================

  extra: {
    variant: VARIANT,

    apiUrl: API_URL,

    mapStyleUrl: MAP_STYLE_URL,

    ...(PROJECT_ID
      ? {
          eas: {
            projectId: PROJECT_ID,
          },
        }
      : {}),
  },
});
