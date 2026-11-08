import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, Row, Sheet, T } from '../components/ui';
import { CenterPin, YMap, type YMapHandle } from '../components/YMap';
import { KIRKUK_CENTER } from '../config';
import { api } from '../lib/api';
import { currentPosition } from '../lib/device';
import { getFix } from '../lib/location';
import { haversineKm, inArea } from '../lib/geo';
import type { ReverseInfo } from '../lib/types';
import { useAppConfig } from '../state/appConfig';
import { placeBus } from '../state/placeBus';
import { colors, radius, shadow, space } from '../theme';

/** اختيار موقع على الخريطة (مثلاً موقع محل التاجر) — النتيجة ترجع عبر placeBus */
export default function PickLocation() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ target: string; title?: string; lat?: string; lng?: string }>();
  const map = useRef<YMapHandle>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [info, setInfo] = useState<ReverseInfo | null>(null);
  const [moving, setMoving] = useState(false);
  const known = useRef<{ lat: number; lng: number; label: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = params.lat && params.lng ? { lat: Number(params.lat), lng: Number(params.lng) } : null;
  const [here] = useState(() => getFix());

  useEffect(() => {
    if (!start) currentPosition().then((p) => p && map.current?.flyTo(p, 17));
    return placeBus.on((target, place) => {
      if (target !== 'pick-location') return;
      known.current = { lat: place.lat, lng: place.lng, label: place.address ?? '' };
      map.current?.flyTo(place, 17);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCenter = useCallback((c: { lat: number; lng: number }) => {
    setCenter(c);
    setMoving(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api<ReverseInfo>('/api/geo/reverse', { query: { lat: c.lat, lng: c.lng } })
        .then((r) => {
          const k = known.current;
          setInfo(k && haversineKm(k, c) < 0.03 && k.label ? { ...r, address: k.label } : r);
        })
        .catch(() => setInfo(null));
    }, 450);
  }, []);

  const confirm = () => {
    if (!center) return;
    if (!inArea(center, cfg.serviceArea)) {
      Alert.alert('', t('errors.outside_service_area'));
      return;
    }
    placeBus.emit(params.target, { lat: center.lat, lng: center.lng, address: info?.address ?? null });
    router.back();
  };

  const title = info?.area ?? info?.address ?? info?.street;
  return (
    <View style={{ flex: 1 }}>
      <YMap ref={map} initialCenter={start ?? here ?? KIRKUK_CENTER} initialZoom={start || here ? 17 : 13} onCenterChanged={onCenter} onMoveStart={() => setMoving(true)} />
      <CenterPin kind="dropoff" lifted={moving} label={!moving ? (info?.area ?? null) : null} />
      <View style={[styles.top, { top: insets.top + space.sm }]}>
        <Row>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Icon name="arrow-left" flip />
          </Pressable>
          <T v="h3" style={{ flex: 1 }}>
            {params.title ?? t('places.pickLocation')}
          </T>
        </Row>
        <Pressable onPress={() => router.push({ pathname: '/search', params: { target: 'pick-location' } })} style={styles.search}>
          <Icon name="magnify" color={colors.primary} />
          <T v="body" color={colors.muted}>
            {t('book.searchPlace')}
          </T>
        </Pressable>
      </View>
      <Sheet>
        <T v="h3" numberOfLines={1}>
          {moving ? '…' : (title ?? (center ? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` : '…'))}
        </T>
        {!moving && info?.street && info.area ? <T v="caption">{info.street}</T> : null}
        <Button title={t('common.confirm')} disabled={!center || moving} onPress={confirm} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md, gap: space.sm, ...shadow },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, minHeight: 46 },
});
