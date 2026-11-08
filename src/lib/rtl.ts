import { I18nManager, Platform } from 'react-native';

/** هل الواجهة من اليمين لليسار؟ (عربي/كردي) — على الويب نقرأها من اتجاه الصفحة */
export function isRTL(): boolean {
  if (Platform.OS === 'web' && typeof document !== 'undefined') return document.documentElement.dir === 'rtl';
  return I18nManager.isRTL;
}
