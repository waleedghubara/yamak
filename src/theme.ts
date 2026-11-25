import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';

/**
 * هوية يمك — كل الألوان والخطوط بمكان واحد.
 * الألوان مأخوذة من تصميم الهوية المعتمد (البنفسجي)، ويا نسخة داكنة للوضع الليلي.
 *
 * الوضع (فاتح/داكن/حسب النظام) ينقرا **قبل** أي شاشة (SecureStore.getItem متزامن)،
 * فكل الشاشات والمكونات تطلع بالألوان الصحيحة من أول لحظة. تغييره يعيد تشغيل التطبيق
 * مثل تغيير اللغة (شوف setThemeMode بالأسفل).
 */
const light = {
  primary: '#6323AF',
  primaryDark: '#4B0A8C',
  primaryLight: '#9846DE',
  primarySoft: '#F1EAFB',
  primaryMuted: '#D9C0F5',
  bg: '#FAFAFE',
  card: '#FFFFFF',
  text: '#1C1530',
  textSoft: '#4A4160',
  muted: '#7A7290',
  border: '#ECE6F5',
  divider: '#F3EFF9',
  star: '#F5B301',
  success: '#12A150',
  successSoft: '#E7F7EE',
  danger: '#D92D4B',
  dangerSoft: '#FDECEF',
  warning: '#C27C00',
  warningSoft: '#FFF4DC',
  white: '#FFFFFF',
  overlay: 'rgba(28, 21, 48, 0.45)',
};

const dark: typeof light = {
  primary: '#8A4CE0',
  primaryDark: '#6323AF',
  primaryLight: '#A978F0',
  primarySoft: '#241A36',
  primaryMuted: '#4B3A6B',
  bg: '#121019',
  card: '#1C1926',
  text: '#F4F1FB',
  textSoft: '#CBC5DA',
  muted: '#9B94AE',
  border: '#2B2639',
  divider: '#241F31',
  star: '#F5B301',
  success: '#2BC46B',
  successSoft: '#133022',
  danger: '#FF5C77',
  dangerSoft: '#3A1622',
  warning: '#EFB13C',
  warningSoft: '#33260F',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.62)',
};

export type Palette = typeof light;
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_KEY = 'yamak_theme';

function storedMode(): ThemeMode {
  try {
    const v = SecureStore.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** الوضع المختار (system = حسب إعداد الهاتف) */
export const themeMode: ThemeMode = storedMode();
export const isDark: boolean = themeMode === 'dark' || (themeMode === 'system' && Appearance.getColorScheme() === 'dark');
export const colors: Palette = { ...(isDark ? dark : light) };

/** يحفظ الوضع ويرجع true إذا يحتاج إعادة تشغيل حتى يتطبق على كل الشاشات */
export function setThemeMode(mode: ThemeMode): boolean {
  try {
    SecureStore.setItem(THEME_KEY, mode);
  } catch {
    return false;
  }
  const nextDark = mode === 'dark' || (mode === 'system' && Appearance.getColorScheme() === 'dark');
  return nextDark !== isDark;
}

export const fonts = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  bold: 'Vazirmatn_700Bold',
  heavy: 'Vazirmatn_800ExtraBold',
  black: 'Vazirmatn_900Black',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const shadow = {
  shadowColor: isDark ? '#000000' : '#2A0C4A',
  shadowOpacity: isDark ? 0.4 : 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const;
