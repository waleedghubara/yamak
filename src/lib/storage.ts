import * as SecureStore from 'expo-secure-store';

/**
 * تخزين بسيط وآمن على الجهاز (التوكن، اللغة...)
 * AFTER_FIRST_UNLOCK: التطبيق يكدر يقرا التوكن حتى لو الآيفون شغّله بالخلفية والشاشة مقفولة
 * (يصير ويا الكابتن المتصل: تحديث الموقع يشغّل التطبيق بالخلفية بعد ما يسده من الشاشة).
 */
const WRITE_OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  /** مثل get بس يفرّق بين «ماكو قيمة» و«ما كدرنا نقرا» (الموبايل مقفول) — حتى ما نطلّع المستخدم بالغلط */
  async read(key: string): Promise<{ ok: boolean; value: string | null }> {
    try {
      return { ok: true, value: await SecureStore.getItemAsync(key) };
    } catch {
      return { ok: false, value: null };
    }
  },
  async set(key: string, value: string | null): Promise<void> {
    try {
      if (value === null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value, WRITE_OPTS);
    } catch {
      // ignore
    }
  },
};

export const KEYS = {
  token: 'yamak_token',
  lang: 'yamak_lang',
  langChosen: 'yamak_lang_chosen',
  captainOnline: 'yamak_captain_online',
  /** آخر إصدار شُرحت بيه خطوة «بدون قيود للبطارية» للكابتن */
  batteryOkVersion: 'yamak_battery_ok',
} as const;
