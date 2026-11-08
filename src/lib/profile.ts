import { IS_CAPTAIN } from '../config';
import type { Me } from './types';

/** الاسم الثلاثي: الاسم واسم الأب والجد (كل كلمة حرفين أو أكثر) */
export const isTriple = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/).filter((w) => w.length >= 2).length >= 3;

/** YYYY-MM-DD صحيح: من 1920 لحد اليوم */
export function validBirthDate(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return y >= 1920 && dt.getTime() <= Date.now();
}

/**
 * المعلومات الإلزامية قبل ما يستخدم التطبيق:
 *   الكابتن: صورة شخصية (من الكاميرا) — عند التسجيل وعند كل تسجيل دخول إذا ناقصة
 *   الزبون: الاسم الثلاثي + تاريخ الميلاد
 */
export function profileComplete(me: Me): boolean {
  if (!me.user.name?.trim()) return false;
  if (IS_CAPTAIN) return !!me.user.photoUrl;
  return isTriple(me.user.name) && !!me.user.birthDate;
}
