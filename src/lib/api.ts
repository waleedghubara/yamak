import { VARIANT } from '../config';
import { getBaseUrl } from './server';

/** خطأ من السيرفر — code ثابت (مثل quote_expired) والتطبيق يترجمه */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: any,
  ) {
    super(code);
  }
}

/** روابط الصور الخاصة ترجع نسبية (/files/...) — نكملها بعنوان السيرفر */
export function fileUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.startsWith('/') ? `${getBaseUrl()}${u}` : u;
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(t: string | null) {
  authToken = t;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

interface Opts {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}${qs}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        // السيرفر يعرف أي تطبيق (مثلاً رقم دعم الكباتن منفصل عن الزبائن)
        'X-Yamak-App': VARIANT,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    // انقطاع أو ضعف بالإنترنت
    throw new ApiError(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? 'unknown_error', data?.details);
  }
  return data as T;
}

/** يرسل نفس الطلب مرة ثانية إذا النت انقطع (آمن فقط ويا Idempotency-Key) */
export async function apiWithRetry<T>(path: string, opts: Opts, retries = 2): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await api<T>(path, opts);
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'network_error' || i >= retries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}
