import { API_URL } from '../config';
import { storage } from './storage';

/**
 * عنوان السيرفر: الافتراضي من yamak.config.json وقت البناء،
 * وتكدر تغيره من داخل التطبيق (ضغطة مطولة على شعار "يمك" بشاشة الدخول) — مفيد للتجربة.
 */
const KEY = 'yamak_server_url';
let baseUrl = API_URL;
/** تغيير السيرفر متاح بنسخ التجربة فقط (سيرفر الشبكة المحلية http). النسخة الأونلاين (https) ثابتة. */
export const SERVER_SWITCH_ENABLED = API_URL.startsWith('http://');

export function getBaseUrl() {
  return baseUrl;
}

export async function loadBaseUrl() {
  if (!SERVER_SWITCH_ENABLED) return;
  const saved = await storage.get(KEY);
  if (saved) baseUrl = saved;
}

export function normalizeUrl(input: string) {
  let u = input.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  if (u && !/:\d+$/.test(u) && /^http:\/\/(\d{1,3}\.){3}\d{1,3}$/.test(u)) u = `${u}:4000`;
  return u;
}

export async function setBaseUrl(url: string | null) {
  baseUrl = url ? normalizeUrl(url) : API_URL;
  await storage.set(KEY, url ? baseUrl : null);
}

export async function pingServer(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${normalizeUrl(url)}/health`, { signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
