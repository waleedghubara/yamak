import * as SecureStore from 'expo-secure-store';

/** تخزين بسيط وآمن على الجهاز (التوكن، اللغة...) */
export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string | null): Promise<void> {
    try {
      if (value === null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value);
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
} as const;
