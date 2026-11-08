import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Icon, Input, Row, Sheet, T } from '../components/ui';
import { CenterPin, YMap, type YMapHandle } from '../components/YMap';
import { KIRKUK_CENTER } from '../config';
import { api } from '../lib/api';
import { currentPosition, showError } from '../lib/device';
import { getFix } from '../lib/location';
import { haversineKm, inArea } from '../lib/geo';
import { useAppConfig } from '../state/appConfig';
import { placeBus } from '../state/placeBus';
import { colors, radius, shadow, space } from '../theme';

type Kind = 'home' | 'work' | 'favorite' | 'custom';

/** إضافة مكان محفوظ: نحرك الخريطة تحت الدبوس + اسم */
export default function PlaceEdit() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: Kind }>();
  const map = useRef<YMapHandle>(null);
  const [kind, setKind] = useState<Kind>(params.kind ?? 'custom');
  const [label, setLabel] = useState(params.kind === 'home' ? t('places.home') : params.kind === 'work' ? t('places.work') : '');
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [here] = useState(() => getFix());
  const known = useRef<{ lat: number; lng: number; label: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentPosition().then((p) => p && map.current?.flyTo(p, 17));
    return placeBus.on((target, place) => {
      if (target !== 'place-edit') return;
      known.current = { lat: place.lat, lng: place.lng, label: place.address ?? '' };
      map.current?.flyTo(place, 17);
    });
  }, []);

  const onCenter = useCallback((c: { lat: number; lng: number }) => {
    setCenter(c);
    setMoving(false);
    if (timer.current) clearTimeout(timer.current);
    if (known.current && haversineKm(known.current, c) < 0.03) {
      setAddress(known.current.label);
      return;
    }
    timer.current = setTimeout(() => {
      api<{ address: string | null }>('/api/geo/reverse', { query: { lat: c.lat, lng: c.lng } })
        .then((r) => setAddress(r.address))
        .catch(() => {});
    }, 500);
  }, []);

  const save = async () => {
    if (!center) return;
    if (!inArea(center, cfg.serviceArea)) {
      Alert.alert('', t('errors.outside_service_area'));
      return;
    }
    setBusy(true);
    try {
      await api('/api/me/places', { body: { kind, label: label.trim(), lat: center.lat, lng: center.lng, address } });
      router.back();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <YMap ref={map} initialCenter={here ?? KIRKUK_CENTER} initialZoom={here ? 17 : 13} onCenterChanged={onCenter} onMoveStart={() => setMoving(true)} />
      <CenterPin kind="dropoff" lifted={moving} />
      <View style={[styles.top, { top: insets.top + space.sm }]}>
        <Row>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Icon name="arrow-left" flip />
          </Pressable>
          <T v="h3" style={{ flex: 1 }}>
            {t('places.pickLocation')}
          </T>
        </Row>
        <Pressable onPress={() => router.push({ pathname: '/search', params: { target: 'place-edit' } })} style={styles.search}>
          <Icon name="magnify" color={colors.primary} />
          <T v="body" color={colors.muted}>
            {t('book.searchPlace')}
          </T>
        </Pressable>
      </View>
      <Sheet>
        <T v="bodyBold" numberOfLines={2}>
          {moving ? '…' : address ?? (center ? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` : '…')}
        </T>
        <Row style={{ flexWrap: 'wrap' }}>
          {(['home', 'work', 'favorite', 'custom'] as Kind[]).map((k) => (
            <Chip
              key={k}
              label={t(`places.${k}`)}
              selected={kind === k}
              onPress={() => {
                setKind(k);
                if (k === 'home' || k === 'work') setLabel(t(`places.${k}`));
              }}
            />
          ))}
        </Row>
        <Input label={t('places.label')} placeholder={t('places.labelPlaceholder')} value={label} onChangeText={setLabel} maxLength={40} />
        <Button title={t('common.save')} loading={busy} disabled={!center || moving || !label.trim()} onPress={save} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md, gap: space.sm, ...shadow },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, minHeight: 46 },
});
