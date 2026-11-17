/**
 * رصيد الكابتن ويا الشركة (balanceOwed من السيرفر: موجب = عليه للشركة، سالب = رصيد إله مثل هدية 25,000)
 *   رصيد إله  ← «رصيدك الحالي» بالأخضر، ويتحول تدريجياً للأحمر كلما نقص لحد ما يوصل صفر
 *   عليه      ← «مطلوب للشركة» بالأحمر
 */
export const CREDIT_FULL = 25_000;

export function creditOf(balanceOwed: number) {
  return -balanceOwed;
}

/** لون الرصيد: أخضر (رصيد كامل) ← برتقالي ← أحمر غامق (صفر أو مطلوب للشركة) */
export function balanceColor(balanceOwed: number): string {
  const credit = creditOf(balanceOwed);
  if (credit <= 0) return 'hsl(0, 75%, 32%)';
  const t = Math.min(1, credit / CREDIT_FULL);
  return `hsl(${Math.round(140 * t)}, 70%, ${Math.round(32 + 6 * t)}%)`;
}
