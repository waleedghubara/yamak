import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountCircle } from '../../components/AccountCircle';
import { AdBanner } from '../../components/common';
import { Icon, IconButton, Row, T, type IconName } from '../../components/ui';
import { api } from '../../lib/api';
import { iqd, ltr } from '../../lib/format';
import { haversineKm } from '../../lib/geo';
import { loadHomeFeed } from '../../lib/home';
import { requestLocation, useMyLocation } from '../../lib/location';
import { clearTripStatus } from '../../lib/tripStatus';
import type { NearbyCar, Point, PromoBanner, ReverseInfo, Ride, SavedPlace } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { useAuth } from '../../state/auth';
import { setPendingBooking } from '../../state/placeBus';
import { useSocketEvent } from '../../state/socket';
import { colors, fonts, radius, shadow, space } from '../../theme';

const promptedRatings = new Set<string>();
/** السيارات القريبة: كل 15 ثانية طول ما الشاشة مفتوحة (أخف على السيرفر) */
const NEARBY_MS = 15000;

/**
 * الشاشة الرئيسية للزبون (تصميم 1.4):
 *   تحية + زاوية حسابي ← «وين تريد تروح؟» ← خريطة مصغرة بالسيارات القريبة
 *   ← لوحة إعلانية ← مربعات الخدمات (تكسي، خطي، توصيل، خصومات) ← شريط عروض يمك.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const cfg = useAppConfig();
  const insets = useSafeAreaInsets();
  const { fix, granted, approximate } = useMyLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [cars, setCars] = useState<NearbyCar[]>([]);
  const [active, setActive] = useState<Ride | null>(null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [promos, setPromos] = useState<PromoBanner[]>([]);
  const [unread, setUnread] = useState(0);
  const [stale, setStale] = useState(false);
  const [pendingRating, setPendingRating] = useState<{ id: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastAddressAt = useRef<{ lat: number; lng: number } | null>(null);
  const posRef = useRef(fix);
  useEffect(() => {
    posRef.current = fix;
  }, [fix]);

  // حركة خفيفة للوقو عند فتح التطبيق (ما تأخر الإقلاع)
  const [logo] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(logo, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
  }, [logo]);

  useEffect(() => {
    if (!fix) return;
    const last = lastAddressAt.current;
    if (last && haversineKm(last, fix) < 0.08) return;
    lastAddressAt.current = { lat: fix.lat, lng: fix.lng };
    api<ReverseInfo>('/api/geo/reverse', { query: { lat: fix.lat, lng: fix.lng } })
      .then((r) => setAddress([r.area, r.street].filter(Boolean).join(' – ') || r.address || r.landmark))
      .catch(() => {});
  }, [fix]);

  const load = useCallback(async () => {
    const { feed, stale: fromCache } = await loadHomeFeed();
    setActive(feed.activeRide);
    if (!feed.activeRide && !fromCache) clearTripStatus();
    setUnread(feed.unread);
    setPlaces(feed.places);
    setStale(fromCache);
    const r = feed.pendingRating;
    setPendingRating(r ? { id: r.id } : null);
    if (r && !promptedRatings.has(r.id)) {
      promptedRatings.add(r.id);
      router.push(`/rate/${r.id}`);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
      api<PromoBanner[]>('/api/rides/promo-banners').then(setPromos).catch(() => {});
    }, [load]),
  );

  const hasPos = !!fix;
  useFocusEffect(
    useCallback(() => {
      if (!hasPos) return;
      const tick = () => {
        const p = posRef.current;
        if (!p) return;
        api<NearbyCar[]>('/api/geo/nearby-captains', { query: { lat: p.lat, lng: p.lng } })
          .then(setCars)
          .catch(() => {});
      };
      tick();
      const id = setInterval(tick, NEARBY_MS);
      return () => clearInterval(id);
    }, [hasPos]),
  );

  useSocketEvent<Ride>('ride:update', (r) => {
    const live = ['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_TRIP'].includes(r.status);
    setActive(live ? r : null);
    if (!live) clearTripStatus(undefined, r.id);
  });

  const here: Point | undefined = fix ? { lat: fix.lat, lng: fix.lng, address } : undefined;
  const ridesOff = cfg.ridesEnabled === false;

  const book = (opts: { dropoff?: Point; startAt?: 'pickup' | 'dropoff'; service?: 'ride' | 'delivery' } = {}) => {
    if (ridesOff) {
      Alert.alert(t('live.ridesOff'), t('errors.rides_disabled'));
      return;
    }
    setPendingBooking({ pickup: opts.startAt === 'dropoff' ? here : undefined, dropoff: opts.dropoff });
    router.push({ pathname: '/book', params: { step: opts.startAt ?? 'pickup', service: opts.service ?? 'ride' } });
  };

  const comingSoon = () => Alert.alert(t('common.comingSoon'), t('common.comingSoonBody'));
  const quickPlaces = places
    .filter((p) => p.kind === 'home' || p.kind === 'work')
    .concat(places.filter((p) => p.kind !== 'home' && p.kind !== 'work'))
    .slice(0, 4);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.sm, gap: space.md, paddingBottom: space.xl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await load().catch(() => {});
            setRefreshing(false);
          }}
        />
      }
    >
      {/* التحية + اللوقو + الجرس + زاوية حسابي */}
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T v="caption">{me?.user.name ? t('home.helloName', { name: me.user.name.split(' ')[0] }) : t('home.hello')}</T>
          <Animated.View style={{ opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
            <T v="logo" style={{ fontSize: 30, lineHeight: 44 }}>
              {t('appName')}
            </T>
          </Animated.View>
        </View>
        <Row gap={space.sm}>
          <View>
            <IconButton name={unread ? 'bell-ring' : 'bell-outline'} color={colors.primary} size={40} onPress={() => router.push('/notifications')} />
            {unread ? (
              <View style={styles.badge}>
                <T v="small" color={colors.white} style={{ fontSize: 11, lineHeight: 14 }}>
                  {unread > 9 ? '9+' : unread}
                </T>
              </View>
            ) : null}
          </View>
          <AccountCircle />
        </Row>
      </Row>

      {/* وين تريد تروح */}
      <Pressable onPress={() => book({ startAt: here ? 'dropoff' : 'pickup' })} style={styles.search}>
        <Icon name="magnify" color={colors.primary} />
        <T v="body" color={colors.muted} style={{ flex: 1 }}>
          {t('home.searchPlaceholder')}
        </T>
      </Pressable>

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

      {pendingRating ? (
        <Pressable onPress={() => router.push(`/rate/${pendingRating.id}`)} style={styles.rateBanner}>
          <Icon name="star" color={colors.star} />
          <View style={{ flex: 1 }}>
            <T v="bodyBold">{t('ride.rateCaptain')}</T>
            <T v="small">{t('rate.required')}</T>
          </View>
          <Icon name="chevron-right" flip color={colors.muted} />
        </Pressable>
      ) : null}

      {stale ? (
        <Row style={styles.notice}>
          <Icon name="wifi-off" color={colors.warning} />
          <T v="small" color={colors.textSoft} style={{ flex: 1 }}>
            {t('offline.cached')}
          </T>
        </Row>
      ) : null}

      {ridesOff ? (
        <Row style={styles.notice}>
          <Icon name="clock-outline" color={colors.warning} />
          <View style={{ flex: 1 }}>
            <T v="bodyBold" color={colors.warning}>
              {t('live.ridesOff')}
            </T>
            <T v="small" color={colors.textSoft}>
              {t('live.ridesOffHint')}
            </T>
          </View>
        </Row>
      ) : null}

      {/* سطر الموقع والسيارات القريبة (بدون خريطة — أخف على التطبيق والنت) */}
      <Row style={styles.whereRow}>
        {granted === false ? (
          <Pressable onPress={() => requestLocation()} hitSlop={6}>
            <Row gap={6}>
              <Icon name="crosshairs-gps" size={16} color={colors.primary} />
              <T v="small" color={colors.primary}>
                {t('perm.allow')}
              </T>
            </Row>
          </Pressable>
        ) : (
          <>
            <Icon name="map-marker" size={16} color={colors.primary} />
            <T v="small" color={colors.textSoft} numberOfLines={1} style={{ flex: 1 }}>
              {address ?? (fix ? `${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}` : t('home.locating'))}
            </T>
            {cars.length ? <T v="small" color={colors.success}>{t('home.nearbyCars', { count: cars.length })}</T> : null}
          </>
        )}
      </Row>
      {approximate ? (
        <Pressable onPress={() => Linking.openSettings()}>
          <T v="small" color={colors.warning}>
            {t('perm.preciseOff')}
          </T>
        </Pressable>
      ) : null}

      {/* اللوحة الإعلانية (نفس القياس القديم) */}
      <AdBanner app="customer" />

      {/* مربعات الخدمات */}
      <View style={{ gap: space.sm }}>
        <Row gap={space.sm}>
          <Tile icon="car" label={t('home.taxi')} primary onPress={() => book({ startAt: 'pickup' })} />
          <Tile icon="account-group" label={t('khatti.title')} soon={cfg.khattiEnabled === false} onPress={() => (cfg.khattiEnabled === false ? comingSoon() : router.push('/khatti'))} />
        </Row>
        <Row gap={space.sm}>
          <Tile
            icon="package-variant-closed"
            label={t('home.delivery')}
            soon={!cfg.deliveryEnabled}
            onPress={cfg.deliveryEnabled ? () => book({ startAt: 'pickup', service: 'delivery' }) : comingSoon}
          />
          <Tile icon="ticket-percent" label={t('account.discounts')} bell={promos.length > 0} onPress={() => router.push('/discounts')} />
        </Row>
      </View>

      {quickPlaces.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {quickPlaces.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => book({ startAt: here ? 'dropoff' : 'pickup', dropoff: { lat: p.lat, lng: p.lng, address: p.address ?? p.label } })}
              style={styles.placeChip}
            >
              <Icon name={p.kind === 'home' ? 'home-variant' : p.kind === 'work' ? 'briefcase-variant' : 'star'} size={16} color={colors.primary} />
              <T v="small" color={colors.text}>
                {p.label}
              </T>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* شريط «عروض يمك»: أكواد الخصم الفعالة — ضغطة وحدة تفتح الطلب والكود مطبّق */}
      {promos.length ? (
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="h3">{t('home.yamakOffers')}</T>
            <Pressable onPress={() => router.push('/discounts')} hitSlop={8}>
              <T v="small" color={colors.primary}>
                {t('common.seeAll')}
              </T>
            </Pressable>
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {promos.map((p) => (
              <Pressable
                key={p.code}
                onPress={() => {
                  setPendingBooking({ promo: p.code });
                  router.push({ pathname: '/book', params: { step: 'pickup' } });
                }}
                style={({ pressed }) => [styles.promoCard, pressed && { opacity: 0.85 }]}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <T style={{ fontFamily: fonts.black, fontSize: 15, lineHeight: 24, color: colors.primaryDark }}>{ltr(p.code)}</T>
                  <T v="bodyBold" color={colors.success}>
                    {p.kind === 'percent' ? `${p.value}%` : iqd(p.value)}
                  </T>
                </Row>
                {p.text ? (
                  <T v="small" numberOfLines={1} color={colors.textSoft}>
                    {p.text}
                  </T>
                ) : null}
                <Row gap={4}>
                  <Icon name="ticket-percent" size={14} color={colors.primary} />
                  <T v="small" color={colors.primary}>
                    {t('discounts.use')}
                  </T>
                </Row>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : (
        <AdBanner app="customer" kind="offer" height={110} />
      )}
    </ScrollView>
  );
}

function Tile({
  icon,
  label,
  primary,
  soon,
  bell,
  onPress,
}: {
  icon: IconName;
  label: string;
  primary?: boolean;
  soon?: boolean;
  bell?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, primary && styles.tilePrimary, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={26} color={primary ? colors.white : colors.primary} />
      <T v="small" color={primary ? colors.white : colors.text} numberOfLines={1} style={{ fontFamily: fonts.bold }}>
        {label}
      </T>
      {soon ? (
        <View style={styles.soon}>
          <T style={{ fontFamily: fonts.bold, fontSize: 9, color: colors.primaryDark, lineHeight: 14 }}>{t('common.comingSoon')}</T>
        </View>
      ) : null}
      {bell ? (
        <View style={styles.bell}>
          <Icon name="bell-ring" size={14} color={colors.white} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    minHeight: 52,
    ...shadow,
    shadowOpacity: 0.06,
  },
  whereRow: { gap: 6, paddingHorizontal: space.xs, minHeight: 20 },
  promoCard: {
    width: 190,
    gap: 4,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  notice: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  rateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.star,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.primary, borderRadius: radius.md, padding: space.md },
  tile: {
    flex: 1,
    height: 86,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
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
  bell: { position: 'absolute', top: 6, end: 6, backgroundColor: colors.danger, borderRadius: radius.pill, padding: 3 },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
});
