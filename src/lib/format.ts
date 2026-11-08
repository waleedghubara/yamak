import i18n from '../i18n';

/** 3,250 د.ع */
export function iqd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('en-US')} ${i18n.t('currency')}`;
}

export function km(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(Math.round(n * 10) / 10).toLocaleString('en-US')} ${i18n.t('km')}`;
}

export function minutes(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.max(1, Math.round(n))} ${i18n.t('min')}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortAddress(p: { address?: string | null; lat: number; lng: number } | null | undefined): string {
  if (!p) return '—';
  return p.address?.trim() || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

/** يعرض الرقم من اليسار لليمين حتى داخل نص عربي */
export function ltr(s: string | null | undefined): string {
  return s ? `⁦${s}⁩` : '';
}
