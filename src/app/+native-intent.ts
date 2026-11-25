/**
 * موقع يوصل عن طريق «مشاركة» من واتساب (ACTION_SEND بأندرويد، Share Extension بالآيفون):
 * النظام يفتح التطبيق على العنوان yamak://expo-sharing — نرجعه للصفحة الأولى،
 * وكمبوننت IncomingLocation يقرا النص المشارَك ويفتح شاشة الطلب بالوجهة جاهزة.
 *
 * وموقع ينضغط عليه مباشرة بواتساب يوصل geo:35.41,44.42?q=35.41,44.42، وقبل ما
 * يوصل للراوتر يتبدل الـ scheme فيصير yamak://35.41,44.42?q=… — ما يطابق أي مسار
 * بالتطبيق فكان يطلع «Unmatched Route». نرجعه هم للصفحة الأولى، و IncomingLocation
 * يقرا الإحداثيات من رابط الفتح نفسه ويفتح شاشة الطلب بالوجهة جاهزة.
 */
const SHARE_INTO = /^[a-z][a-z0-9+.-]*:\/\/expo-sharing(?:[/?#]|$)/i;
/** geo:LAT,LNG…  أو  <scheme>://LAT,LNG…  — الإحداثيات أرقام فما تتعارض مع مسارات التطبيق */
const GEO_LINK = /^(?:geo:|[a-z][a-z0-9+.-]*:\/\/)-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?(?:[/?#]|$)/i;

export function redirectSystemPath({ path }: { path: string }): string {
  return SHARE_INTO.test(path) || GEO_LINK.test(path) ? '/' : path;
}
