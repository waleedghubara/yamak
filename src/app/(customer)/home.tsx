import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdBanner } from '../../components/common';
import { BottomModal, Button, Chip, Icon, IconButton, ListItem, Row, Sheet, T, type IconName } from '../../components/ui';
import { YMap, type MapMarker, type YMapHandle } from '../../components/YMap';
import { KIRKUK_CENTER, NEARBY_REFRESH_MS } from '../../config';
import { api } from '../../lib/api';
import { haversineKm } from '../../lib/geo';
import { getFix, requestLocation, useMyLocation } from '../../lib/location';
import type { NearbyCar, Point, ReverseInfo, Ride, SavedPlace } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { useAuth } from '../../state/auth';
import { setPendingBooking } from '../../state/placeBus';
import { useSocketEvent } from '../../state/socket';
import { colors, fonts, radius, shadow, space } from '../../theme';

const promptedRatings = new Set<string>();

/**
 * الشاشة الرئيسية: الخريطة كاملة + "أين تريد الذهاب؟" + موقعك الحالي
 * + السيارات القريبة (مواقع حقيقية من السيرفر) + الخدمات الأربع.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const cfg = useAppConfig();
  const insets = useSafeAreaInsets();
  const map = useRef<YMapHandle>(null);
  // موقعي: يطلع فوراً (آخر موقع معروف) ويتحدث كل ثانيتين من GPS
  const { fix, granted, approximate } = useMyLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [cars, setCars] = useState<NearbyCar[]>([]);
  const [active, setActive] = useState<Ride | null>(null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [initial] = useState(() => getFix());
  const centered = useRef(!!initial);
  const userMoved = useRef(false);
  const lastAddressAt = useRef<{ lat: number; lng: number } | null>(null);
  const posRef = useRef(fix);
  posRef.current = fix;

  // أول ما يوصل الموقع نروح عليه (إلا إذا المستخدم حرك الخريطة بنفسه)
  useEffect(() => {
    if (!fix) return;
    if (!centered.current && !userMoved.current) {
      centered.current = true;
      map.current?.flyTo(fix, 15);
    }
    // اسم المكان: بس إذا تحركت أكثر من 80 متر (مو كل قراءة GPS)
    const last = lastAddressAt.current;
    if (last && haversineKm(last, fix) < 0.08) return;
    lastAddressAt.current = { lat: fix.lat, lng: fix.lng };
    api<ReverseInfo>('/api/geo/reverse', { query: { lat: fix.lat, lng: fix.lng } })
      .then((r) => setAddress([r.area, r.street].filter(Boolean).join(' – ') || r.address || r.landmark))
      .catch(() => {});
  }, [fix]);

  const locate = useCallback(async () => {
    const f = posRef.current;
    if (f) {
      map.current?.flyTo(f, 16);
      return;
    }
    centered.current = false;
    userMoved.current = false;
    await requestLocation();
  }, []);

  // عند الرجوع للشاشة: الرحلة الحالية، الأماكن المحفوظة، والتقييم المعلق
  useFocusEffect(
    useCallback(() => {
      api<Ride | null>('/api/rides/active').then(setActive).catch(() => {});
      api<SavedPlace[]>('/api/me/places').then(setPlaces).catch(() => {});
      api<Ride | null>('/api/rides/pending-rating')
        .then((r) => {
          if (r && !promptedRatings.has(r.id)) {
            promptedRatings.add(r.id);
            router.push(`/rate/${r.id}`);
          }
        })
        .catch(() => {});
    }, []),
  );

  // السيارات القريبة كل 10 ثواني طول ما الشاشة مفتوحة
  const hasPos = !!fix;
  useFocusEffect(
    useCallback(() => {
      if (!hasPos) return;
      const load = () => {
        const p = posRef.current;
        if (!p) return;
        api<NearbyCar[]>('/api/geo/nearby-captains', { query: { lat: p.lat, lng: p.lng } })
          .then(setCars)
          .catch(() => {});
      };
      load();
      const id = setInterval(load, NEARBY_REFRESH_MS);
      return () => clearInterval(id);
    }, [hasPos]),
  );

  useSocketEvent<Ride>('ride:update', (r) => {
    setActive(['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_TRIP'].includes(r.status) ? r : null);
  });

  const here: Point | undefined = fix ? { lat: fix.lat, lng: fix.lng, address } : undefined;

  const book = (opts: { dropoff?: Point; startAt?: 'pickup' | 'dropoff'; service?: 'ride' | 'delivery' }) => {
    setPendingBooking({ pickup: opts.startAt === 'dropoff' ? here : undefined, dropoff: opts.dropoff });
    router.push({ pathname: '/book', params: { step: opts.startAt ?? 'pickup', service: opts.service ?? 'ride' } });
  };

  const markers: MapMarker[] = [
    ...(fix ? [{ id: 'me', kind: 'me' as const, lat: fix.lat, lng: fix.lng }] : []),
    ...cars.map((c) => ({ id: `car-${c.id}`, kind: 'nearby' as const, lat: c.lat, lng: c.lng, heading: c.heading })),
  ];

  const comingSoon = () => Alert.alert(t('common.comingSoon'), t('common.comingSoonBody'));
  const quickPlaces = places.filter((p) => p.kind === 'home' || p.kind === 'work').concat(places.filter((p) => p.kind !== 'home' && p.kind !== 'work')).slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <YMap
        ref={map}
        initialCenter={initial ?? KIRKUK_CENTER}
        initialZoom={initial ? 15 : 12.5}
        markers={markers}
        onMoveStart={() => {
          userMoved.current = true;
        }}
      />

      {/* الأعلى: الترحيب + أين تريد الذهاب + موقعك الحالي */}
      <View style={[styles.top, { top: insets.top + space.sm }]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="caption">{me?.user.name ? t('home.helloName', { name: me.user.name.split(' ')[0] }) : t('home.hello')}</T>
            <T v="h2">{t('home.whereTo')}</T>
          </View>
          <T v="logo" style={{ fontSize: 30, lineHeight: 42 }}>
            {t('appName')}
          </T>
        </Row>
        <Pressable onPress={() => book({ startAt: here ? 'dropoff' : 'pickup' })} style={styles.search}>
          <Icon name="magnify" color={colors.primary} />
          <T v="body" color={colors.muted} style={{ flex: 1 }}>
            {t('home.searchPlaceholder')}
          </T>
        </Pressable>
        {granted === false ? (
          <Button small kind="secondary" icon="crosshairs-gps" title={t('perm.allow')} onPress={locate} />
        ) : (
          <>
            <Row gap={6}>
              <Icon name="map-marker" size={18} color={colors.primary} />
              <T v="small" color={colors.textSoft} numberOfLines={1} style={{ flex: 1 }}>
                {t('home.currentLocation')}: {address ?? (fix ? `${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}` : t('home.locating'))}
              </T>
            </Row>
            {approximate ? (
              <Pressable onPress={() => Linking.openSettings()}>
                <T v="small" color={colors.warning}>
                  {t('perm.preciseOff')}
                </T>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      <Sheet>
        <IconButton name="crosshairs-gps" color={colors.primary} onPress={locate} style={styles.recenter} />

        {active ? (
          <Pressable onPress={() => router.push(`/ride/${active.id}`)} style={styles.activeBanner}>
            <Icon name="car-clock" color={colors.white} />
            <View style={{ flex: 1 }}>
              <T v="bodyBold" color={colors.white}>
                {t('home.activeRide')}
              </T>
              <T v="small" color={colors.primaryMuted}>
                {t(`status.${active.status}`)}
              </T>
            </View>
            <T v="bodyBold" color={colors.white}>
              {t('home.open')}
            </T>
          </Pressable>
        ) : null}

        <Row gap={space.sm} style={{ justifyContent: 'space-between' }}>
          <ServiceTile icon="car" label={t('home.taxi')} primary onPress={() => book({ startAt: 'pickup' })} />
          <ServiceTile
            icon="package-variant-closed"
            label={t('home.delivery')}
            soon={!cfg.deliveryEnabled}
            onPress={cfg.deliveryEnabled ? () => book({ startAt: 'pickup', service: 'delivery' }) : comingSoon}
          />
          <ServiceTile icon="shopping-outline" label={t('home.market')} soon onPress={comingSoon} />
          <ServiceTile icon="view-grid-outline" label={t('home.more')} onPress={() => setMoreOpen(true)} />
        </Row>

        {quickPlaces.length ? (
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {quickPlaces.map((p) => (
              <Chip
                key={p.id}
                icon={p.kind === 'home' ? 'home-variant' : p.kind === 'work' ? 'briefcase-variant' : 'star'}
                label={p.label}
                onPress={() => book({ startAt: here ? 'dropoff' : 'pickup', dropoff: { lat: p.lat, lng: p.lng, address: p.address ?? p.label } })}
              />
            ))}
          </Row>
        ) : null}

        {cars.length ? (
          <T v="small" center>
            {t('home.nearbyCars', { count: cars.length })}
          </T>
        ) : null}

        <AdBanner app="customer" />
      </Sheet>

      <BottomModal visible={moreOpen} onClose={() => setMoreOpen(false)} title={t('more.title')}>
        {(
          [
            ['history', 'more.myRides', () => router.navigate('/(customer)/rides')],
            ['bookmark-outline', 'more.saved', () => router.navigate('/(customer)/places')],
            ['ticket-percent', 'more.promo', () => Alert.alert(t('more.promo'), t('account.discountsHint'))],
            ['star-outline', 'more.offers', comingSoon],
            ['headset', 'more.support', () => router.push('/support')],
            ['account-outline', 'more.settings', () => router.navigate('/(customer)/account')],
          ] as [IconName, string, () => void][]
        ).map(([icon, key, fn]) => (
          <ListItem
            key={key}
            icon={icon}
            title={t(key)}
            onPress={() => {
              setMoreOpen(false);
              fn();
            }}
          />
        ))}
      </BottomModal>
    </View>
  );
}

function ServiceTile({ icon, label, primary, soon, onPress }: { icon: IconName; label: string; primary?: boolean; soon?: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, primary && styles.tilePrimary, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={30} color={primary ? colors.white : colors.primary} />
      <T v="small" color={primary ? colors.white : colors.text} style={{ fontFamily: fonts.bold }} numberOfLines={1}>
        {label}
      </T>
      {soon ? (
        <View style={styles.soon}>
          <T style={{ fontFamily: fonts.bold, fontSize: 9, color: colors.primaryDark, lineHeight: 14 }}>{t('common.comingSoon')}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
    ...shadow,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    minHeight: 52,
  },
  recenter: { position: 'absolute', top: -60, end: space.lg },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: space.md,
  },
  tile: {
    flex: 1,
    aspectRatio: 0.95,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...shadow,
    shadowOpacity: 0.06,
  },
  tilePrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  soon: { position: 'absolute', top: 6, start: 6, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 5 },
});
