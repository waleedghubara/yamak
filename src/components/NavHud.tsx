import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { km, minutes } from '../lib/format';
import { maneuverIcon, maneuverKey, roundDistance, type NavProgress, type NavRoute } from '../lib/nav';
import { colors, fonts, radius, shadow, space } from '../theme';
import { Icon, T, type IconName } from './ui';

/**
 * واجهة الملاحة داخل تطبيق الكابتن:
 *   فوك: المناورة الجاية (السهم + بعدها كم متر + اسم الشارع)
 *   زر إنهاء الملاحة + زر الرجوع للمتابعة إذا حرّك الخريطة بإيده
 */
export function NavHud({
  route,
  prog,
  loading,
  rerouting,
  paused,
  onExit,
  onRecenter,
}: {
  route: NavRoute | null;
  prog: NavProgress | null;
  loading: boolean;
  rerouting: boolean;
  paused: boolean;
  onExit: () => void;
  onRecenter: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toPickup = route?.phase !== 'to_destination';

  let title: string;
  let sub: string | null = null;
  let icon: IconName = 'navigation-variant';
  let dist: string | null = null;
  if (loading || !route) {
    title = t('nav.loading');
  } else if (prog?.arrived) {
    title = toPickup ? t('nav.arrivedPickup') : t('nav.arrivedDest');
    icon = 'flag-checkered';
  } else if (rerouting) {
    title = t('nav.rerouting');
  } else {
    const step = prog?.next ?? null;
    const k = maneuverKey(step);
    title = t(k.key, { n: k.n });
    sub = step?.name ? step.name : null;
    icon = maneuverIcon(step) as IconName;
    if (prog) {
      if (prog.toNextM < 30) dist = t('nav.now');
      else {
        const d = roundDistance(prog.toNextM);
        dist = `${d.v} ${d.unit === 'km' ? t('km') : t('nav.m')}`;
      }
    }
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + space.sm }]}>
      <View style={styles.banner}>
        <View style={styles.iconBox}>
          {loading || rerouting ? <ActivityIndicator color={colors.white} /> : <Icon name={icon} size={40} color={colors.white} />}
        </View>
        <View style={{ flex: 1 }}>
          {dist ? (
            <T style={styles.dist} numberOfLines={1}>
              {dist}
            </T>
          ) : null}
          <T style={styles.title} numberOfLines={2}>
            {title}
          </T>
          {sub ? (
            <T style={styles.sub} numberOfLines={1}>
              {sub}
            </T>
          ) : null}
        </View>
        <Pressable onPress={onExit} hitSlop={10} style={styles.exit} accessibilityLabel={t('nav.stop')}>
          <Icon name="close" size={22} color={colors.white} />
        </Pressable>
      </View>

      <View style={styles.row}>
        <View style={styles.chip}>
          <Icon name={toPickup ? 'account' : 'map-marker'} size={16} color={colors.primary} />
          <T v="small" color={colors.text}>
            {toPickup ? t('nav.toPickup') : t('nav.toDropoff')}
            {prog ? ` · ${km(prog.remainingM / 1000)} · ${minutes(prog.remainingMin)}` : ''}
          </T>
        </View>
        {paused ? (
          <Pressable onPress={onRecenter} style={[styles.chip, { backgroundColor: colors.primary }]}>
            <Icon name="crosshairs-gps" size={16} color={colors.white} />
            <T v="small" color={colors.white}>
              {t('nav.recenter')}
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, gap: space.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: space.md, ...shadow },
  iconBox: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  dist: { color: '#FFC83D', fontFamily: fonts.black, fontSize: 26, lineHeight: 36 },
  title: { color: colors.white, fontFamily: fonts.bold, fontSize: 17, lineHeight: 26 },
  sub: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  exit: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, ...shadow },
});
