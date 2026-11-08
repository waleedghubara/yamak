import { StyleSheet, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../theme';
import { CarIcon } from './CarIcon';
import type { MapMarker } from './mapTypes';
import { Icon, T } from './ui';

export function MarkerView({ marker }: { marker: MapMarker }) {
  switch (marker.kind) {
    case 'pickup':
    case 'dropoff':
    case 'stop':
      return <Pin label={marker.kind === 'pickup' ? 'A' : 'B'} kind={marker.kind} />;
    case 'me':
      return (
        <View style={styles.meOuter}>
          <View style={styles.meInner} />
        </View>
      );
    case 'car':
      return <CarIcon size={46} heading={marker.heading} color={colors.primaryDark} />;
    case 'nearby':
      return <CarIcon size={34} heading={marker.heading} color={colors.primary} />;
  }
}

/** الدبوس: أخضر/بنفسجي للانطلاق، غامق للوجهة */
export function Pin({ label, kind = 'pickup', size = 40 }: { label?: string; kind?: 'pickup' | 'dropoff' | 'stop'; size?: number }) {
  const bg = kind === 'pickup' ? colors.primary : kind === 'stop' ? colors.primaryLight : colors.primaryDark;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.pinHead, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        {kind === 'dropoff' ? (
          <Icon name="map-marker" size={size * 0.55} color={colors.white} />
        ) : (
          <T style={{ color: colors.white, fontFamily: fonts.black, fontSize: size * 0.42, lineHeight: size * 0.6 }}>{label}</T>
        )}
      </View>
      <View style={[styles.pinStem, { backgroundColor: bg }]} />
    </View>
  );
}

/** الدبوس الثابت بنص الخريطة: الزبون يحرك الخريطة تحته. فوقه اسم المنطقة */
export function CenterPin({ kind, lifted, label }: { kind: 'pickup' | 'dropoff' | 'stop'; lifted?: boolean; label?: string | null }) {
  return (
    <View pointerEvents="none" style={styles.centerPinWrap}>
      {/* نرفع الدبوس نص طوله حتى رأس الإبرة يقعد على مركز الخريطة */}
      <View style={{ alignItems: 'center', transform: [{ translateY: -28 - (lifted ? 10 : 0) - (label ? 20 : 0) }] }}>
        {label ? (
          <View style={styles.areaBubble}>
            <T numberOfLines={1} style={styles.areaText}>
              {label}
            </T>
          </View>
        ) : null}
        <Pin kind={kind} label={kind === 'pickup' ? 'A' : 'B'} size={46} />
      </View>
      <View style={styles.centerDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  pinHead: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white, ...shadow },
  pinStem: { width: 4, height: 12, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginTop: -2 },
  meOuter: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(99,35,175,0.2)', alignItems: 'center', justifyContent: 'center' },
  meInner: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.white },
  areaBubble: { backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 6, maxWidth: 260, ...shadow },
  areaText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13, lineHeight: 20 },
  // الدبوس يقعد بالضبط بنص الخريطة (رأس الدبوس فوق النقطة)
  centerPinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryDark, opacity: 0.5 },
});
