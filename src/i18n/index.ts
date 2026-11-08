import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DevSettings, I18nManager, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import type { Lang } from '../lib/types';
import { KEYS, storage } from '../lib/storage';
import ar from './ar';
import ckb from './ckb';
import tk from './tk';

export const LANGS: { code: Lang; label: string; rtl: boolean }[] = [
  { code: 'ar', label: 'العربية', rtl: true },
  { code: 'ckb', label: 'کوردی', rtl: true },
  { code: 'tk', label: 'Türkmençe', rtl: false },
];

export const isRtlLang = (l: string) => LANGS.find((x) => x.code === l)?.rtl ?? true;

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, ckb: { translation: ckb }, tk: { translation: tk } },
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  returnNull: false,
});

const RELOAD_GUARD_KEY = 'yamak_rtl_reload_at';

async function reloadApp() {
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}

/** اتجاه الواجهة (يمين/يسار) يتطبق بعد إعادة تشغيل التطبيق */
async function ensureDirection(lang: string, allowReload: boolean) {
  const rtl = isRtlLang(lang);
  if (Platform.OS === 'web') {
    // معاينة الويب: الاتجاه من خاصية dir بالصفحة
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    return;
  }
  if (I18nManager.isRTL === rtl) return;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  if (!allowReload) return;
  // حماية من إعادة تشغيل متكررة (مثلاً داخل Expo Go اللي يرجع الاتجاه كل مرة)
  const last = Number((await storage.get(RELOAD_GUARD_KEY)) ?? 0);
  if (Date.now() - last < 20_000) return;
  await storage.set(RELOAD_GUARD_KEY, String(Date.now()));
  await reloadApp();
}

/** عند فتح التطبيق: يرجع اللغة المحفوظة. يرجع true إذا المستخدم اختار لغة سابقاً */
export async function initLanguage(): Promise<boolean> {
  const lang = ((await storage.get(KEYS.lang)) as Lang | null) ?? 'ar';
  await i18n.changeLanguage(lang);
  await ensureDirection(lang, true);
  return (await storage.get(KEYS.langChosen)) === '1';
}

export async function setLanguage(lang: Lang) {
  await storage.set(KEYS.lang, lang);
  await storage.set(KEYS.langChosen, '1');
  await i18n.changeLanguage(lang);
  await storage.set(RELOAD_GUARD_KEY, null);
  await ensureDirection(lang, true);
}

export function currentLang(): Lang {
  return (i18n.language as Lang) || 'ar';
}

/** اسم الفئة (أجرة/خصوصي) بلغة المستخدم */
export function localName(n: { ar: string; ckb: string; tk: string } | undefined | null): string {
  if (!n) return '';
  return n[currentLang()] || n.ar;
}

export default i18n;
