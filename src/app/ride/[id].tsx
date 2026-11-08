import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, AppState, Easing, Image, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaptainCard, PriceText, ReasonModal, SosButton, SosModal } from '../../components/common';
import { BottomModal, Button, Divider, Icon, IconButton, Loading, Row, Sheet, T, type IconName } from '../../components/ui';
import { YMap, type MapMarker, type YMapHandle } from '../../components/YMap';
import { api, fileUrl } from '../../lib/api';
import { showError } from '../../lib/device';
import { dateTime, iqd, km, ltr, minutes, shortAddress } from '../../lib/format';
import { ACTIVE_STATUSES, type Point, type Ride, type Tracking } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { placeBus, setPendingBooking } from '../../state/placeBus';
import { useSocket, useSocketEvent } from '../../state/socket';
import { colors, fonts, radius, space } from '../../theme';

interface DestPreview {
  distanceKm: number;
  durationMin: number;
  oldFare: number;
  finalFare: number;
  fareBeforeDiscount: number;
  discount: number;
}

/** متابعة الرحلة من البحث عن كابتن لحد الوصول والتقييم */
export default function RideScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reconnects } = useSocket();
  const map = useRef<YMapHandle>(null);
  const fitKey = useRef('');

  const [ride, setRide] = useState<Ride | null>(null);
  const [captainLoc, setCaptainLoc] = useState<{ lat: number; lng: number; heading: number | null } | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [modal, setModal] = useState<null | 'cancel' | 'report' | 'sos' | 'dest'>(null);
  const [destPoint, setDestPoint] = useState<Point | null>(null);
  const [destPreview, setDestPreview] = useState<DestPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Ride>(`/api/rides/${id}`)
      .then((r) => {
        if (r.status === 'CANCELLED_BY_DRIVER' && r.replacedByRideId) {
          router.replace(`/ride/${r.replacedByRideId}`);
          return;
        }
        setRide(r);
        if (r.captain?.location) setCaptainLoc(r.captain.location);
      })
      .catch(showError);
  }, [id]);

  useEffect(load, [load, reconnects]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => sub.remove();
  }, [load]);

  useSocketEvent<Ride>('ride:update', (r) => {
    if (r.id !== id) return;
    if (r.status === 'CANCELLED_BY_DRIVER' && r.replacedByRideId) {
      Alert.alert('', t('ride.captainCancelled'));
      router.replace(`/ride/${r.replacedByRideId}`);
      return;
    }
    setRide(r);
  });
  useSocketEvent<{ rideId: string; lat: number; lng: number; heading: number | null }>('ride:captain_location', (d) => {
    if (d.rideId === id) setCaptainLoc(d);
  });
  useSocketEvent<Tracking>('ride:tracking', (d) => {
    if (d.rideId === id) setTracking(d);
  });

  // تعديل الوجهة: المكان الجديد يجي من شاشة البحث
  useEffect(
    () =>
      placeBus.on(async (target, place) => {
        if (target !== `dest:${id}`) return;
        setDestPoint(place);
        setModal('dest');
        setDestPreview(null);
        try {
          const r = await api<{ preview: DestPreview }>(`/api/rides/${id}/destination`, { body: { dropoff: place, confirm: false } });
          setDestPreview(r.preview);
        } catch (err) {
          setModal(null);
          showError(err);
        }
      }),
    [id],
  );

  // الكاميرا: نضبطها مرة لكل مرحلة حتى ما تقفز مع كل تحديث موقع
  useEffect(() => {
    if (!ride) return;
    const toPickup = ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'].includes(ride.status);
    const key = `${ride.status}:${captainLoc ? 1 : 0}`;
    if (fitKey.current === key) return;
    fitKey.current = key;
    const pad = { top: insets.top + 60, bottom: 420, left: 60, right: 60 };
    if (ride.status === 'SEARCHING' || ride.status === 'NO_DRIVER_FOUND') map.current?.flyTo(ride.pickup, 16);
    else if (toPickup) map.current?.fitTo([ride.pickup, ...(captainLoc ? [captainLoc] : [])], pad);
    else map.current?.fitTo([ride.pickup, ...ride.stops, ride.dropoff, ...(captainLoc ? [captainLoc] : [])], pad);
  }, [ride, captainLoc, insets.top]);

  if (!ride) return <Loading />;

  const s = ride.status;
  const active = ACTIVE_STATUSES.includes(s);
  const toPickup = s === 'DRIVER_ASSIGNED' || s === 'DRIVER_EN_ROUTE' || s === 'DRIVER_ARRIVED';
  const track = tracking && ((toPickup && tracking.phase === 'to_pickup') || (s === 'IN_TRIP' && tracking.phase === 'to_destination')) ? tracking : null;

  const markers: MapMarker[] = [
    { id: 'pickup', kind: 'pickup', ...ride.pickup },
    ...ride.stops.map((p, i) => ({ id: `stop${i}`, kind: 'stop' as const, ...p })),
    { id: 'dropoff', kind: 'dropoff', ...ride.dropoff },
  ];
  // سيارة الكابتن: تتحرك بنعومة وتتجه باتجاه سيرها، قبل ركوب الزبون وبعده
  const vehicle = captainLoc && (toPickup || s === 'IN_TRIP') ? captainLoc : null;
  const isDelivery = ride.serviceType === 'delivery';
  const route = track?.geometry ?? (s === 'IN_TRIP' || !active ? ride.routeGeometry : null);

  const cancel = async (reason: string) => {
    const r = await api<{ ride: Ride; penaltyApplied: boolean }>(`/api/rides/${id}/cancel`, { body: { reason } });
    setRide(r.ride);
    setModal(null);
  };

  const quickCancel = () =>
    Alert.alert(t('ride.cancelRequest'), t('common.areYouSure'), [
      { text: t('common.no'), style: 'cancel' },
      { text: t('common.yes'), style: 'destructive', onPress: () => cancel('changed_mind').catch(showError) },
    ]);

  const share = () => {
    if (!ride.shareUrl) return;
    Share.share({
      message: t('ride.shareMessage', {
        captain: ride.captain ? `${ride.captain.name ?? '—'}${ride.captain.code ? ` (${ride.captain.code})` : ''}` : '—',
        car: ride.captain ? `${ride.captain.carModel} ${ride.captain.carColor} — ${ride.captain.plateNumber}` : '—',
        url: ride.shareUrl,
      }),
    }).catch(() => {});
  };

  const togglePause = async () => {
    try {
      setRide(await api<Ride>(`/api/rides/${id}/${ride.paused ? 'resume' : 'pause'}`, { body: {} }));
    } catch (err) {
      showError(err);
    }
  };

  const confirmDestination = async () => {
    if (!destPoint) return;
    setBusy(true);
    try {
      const r = await api<{ ride: Ride }>(`/api/rides/${id}/destination`, { body: { dropoff: destPoint, confirm: true } });
      setRide(r.ride);
      setModal(null);
      fitKey.current = '';
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    try {
      const r = await api<Ride>(`/api/rides/${id}/retry`, { body: {} });
      router.replace(`/ride/${r.id}`);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const orderAgain = () => {
    setPendingBooking({ pickup: ride.pickup, dropoff: ride.dropoff, stops: ride.stops });
    router.replace({ pathname: '/book', params: { service: ride.serviceType ?? 'ride' } });
  };

  const goHome = () => router.replace('/(customer)/home');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <YMap ref={map} initialCenter={ride.pickup} initialZoom={15} markers={markers} route={route} vehicle={vehicle} />
      {s === 'SEARCHING' ? <Pulse /> : null}

      <View style={[styles.top, { top: insets.top + space.sm }]}>
        <IconButton name="arrow-left" flip onPress={() => (router.canGoBack() ? router.back() : goHome())} />
        {ride.number ? (
          <View style={styles.numberPill}>
            <Icon name={isDelivery ? 'package-variant-closed' : 'car'} size={16} color={colors.primary} />
            <T v="bodyBold" color={colors.primaryDark}>
              #{ride.number}
            </T>
          </View>
        ) : null}
        {active && s !== 'SEARCHING' ? <SosButton onTrigger={() => setModal('sos')} /> : <View style={{ width: 44 }} />}
      </View>

      <Sheet scroll style={{ maxHeight: '62%' }}>
        {/* ───── البحث عن كابتن ───── */}
        {s === 'SEARCHING' ? (
          <>
            <T v="h2" center>
              {isDelivery ? t('delivery.searching') : t('ride.searching')}
            </T>
            <T v="caption" center>
              {t('ride.searchingHint')}
            </T>
            <TripSummary ride={ride} />
            {isDelivery ? <DeliveryCard ride={ride} /> : null}
            <Button kind="ghost" title={t('ride.cancelRequest')} onPress={quickCancel} />
          </>
        ) : null}

        {/* ───── ماكو كابتن ───── */}
        {s === 'NO_DRIVER_FOUND' ? (
          <>
            <Icon name="car-clock" size={48} color={colors.primaryMuted} />
            <T v="h2" center>
              {t('ride.noDriver')}
            </T>
            <T v="caption" center>
              {t('ride.noDriverHint')}
            </T>
            <Button title={t('ride.retry')} icon="refresh" loading={busy} onPress={retry} />
            <Button kind="ghost" title={t('ride.backHome')} onPress={goHome} />
          </>
        ) : null}

        {/* ───── الكابتن جاي / وصل / بالرحلة ───── */}
        {toPickup || s === 'IN_TRIP' ? (
          <>
            <StatusHeader ride={ride} track={track} />
            {ride.captain ? <CaptainCard captain={ride.captain} onChat={() => router.push(`/chat/${id}`)} /> : null}
            {isDelivery ? <DeliveryCard ride={ride} /> : null}
            {s === 'IN_TRIP' ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="caption">{t('book.price')}</T>
                <PriceText final={ride.fare.finalFare} before={ride.fare.discount ? ride.fare.fareBeforeDiscount : undefined} />
              </Row>
            ) : null}
            <Divider />
            <Row style={{ justifyContent: 'space-around', flexWrap: 'wrap', rowGap: space.md }}>
              {s === 'IN_TRIP' && !isDelivery ? (
                <Action icon={ride.paused ? 'play' : 'pause'} label={ride.paused ? t('ride.resume') : t('ride.pause')} onPress={togglePause} />
              ) : null}
              {s === 'IN_TRIP' || toPickup ? (
                <Action icon="map-marker-path" label={t('ride.changeDestination')} onPress={() => router.push({ pathname: '/search', params: { target: `dest:${id}` } })} />
              ) : null}
              <Action icon="share-variant" label={t('ride.shareRide')} onPress={share} />
              <Action icon="flag-outline" label={t('ride.report')} onPress={() => setModal('report')} />
              {toPickup ? <Action icon="close" label={t('ride.cancelRide')} danger onPress={() => setModal('cancel')} /> : null}
            </Row>
          </>
        ) : null}

        {/* ───── انتهت الرحلة ───── */}
        {s === 'COMPLETED' ? (
          <>
            <View style={{ alignItems: 'center', gap: space.xs }}>
              <View style={styles.check}>
                <Icon name="check" size={40} color={colors.white} />
              </View>
              <T v="h1">{isDelivery ? t('delivery.completed') : t('ride.completed')}</T>
              <T v="caption">{dateTime(ride.times.completedAt)}</T>
            </View>
            <View style={styles.fareBox}>
              <T v="caption">{t('ride.finalPrice')}</T>
              <T style={{ fontFamily: fonts.black, fontSize: 32, lineHeight: 46, color: colors.primaryDark }}>{iqd(ride.fare.finalFare)}</T>
              <Row gap={6}>
                <Icon name="cash" size={18} color={colors.success} />
                <T v="small">{t('ride.paidCash')}</T>
              </Row>
            </View>
            <FareBreakdown ride={ride} />
            {!ride.rating ? <Button title={t('ride.rateCaptain')} icon="star" onPress={() => router.push(`/rate/${id}`)} /> : null}
            <Button kind="secondary" title={t('ride.orderAgain')} icon="refresh" onPress={orderAgain} />
            <Button kind="ghost" title={t('ride.help')} icon="headset" onPress={() => router.push({ pathname: '/support/new', params: { rideId: id } })} />
            <Button kind="ghost" title={t('common.done')} onPress={goHome} />
          </>
        ) : null}

        {/* ───── ملغاة ───── */}
        {s === 'CANCELLED_BY_CUSTOMER' || s === 'CANCELLED_BY_DRIVER' || s === 'EMERGENCY' ? (
          <>
            <T v="h2" center>
              {t('ride.cancelled')}
            </T>
            <TripSummary ride={ride} />
            <Button title={t('ride.orderAgain')} icon="refresh" onPress={orderAgain} />
            <Button kind="ghost" title={t('ride.help')} icon="headset" onPress={() => router.push({ pathname: '/support/new', params: { rideId: id } })} />
            <Button kind="ghost" title={t('ride.backHome')} onPress={goHome} />
          </>
        ) : null}
      </Sheet>

      <ReasonModal
        visible={modal === 'cancel'}
        title={t('ride.cancelReasonTitle')}
        reasons={cfg.lists.cancelReasonsCustomer}
        labelPrefix="reasons"
        warning={cfg.cancelPenaltyPercent > 0 && s !== 'SEARCHING' ? t('ride.cancelPenaltyWarn', { pct: cfg.cancelPenaltyPercent }) : null}
        confirmLabel={t('ride.cancelRide')}
        onClose={() => setModal(null)}
        onSubmit={cancel}
      />
      <ReasonModal
        visible={modal === 'report'}
        title={t('ride.reportTitle')}
        reasons={cfg.lists.reportCategories.filter((c) => c !== 'customer_behavior')}
        labelPrefix="reportCat"
        withDetails
        confirmLabel={t('common.send')}
        onClose={() => setModal(null)}
        onSubmit={async (category, details) => {
          await api(`/api/rides/${id}/report`, { body: { category, details: details || null } });
          setModal(null);
          Alert.alert('', t('ride.reportSent'));
        }}
      />
      <SosModal visible={modal === 'sos'} rideId={id} onClose={() => setModal(null)} />
      <BottomModal visible={modal === 'dest'} onClose={() => setModal(null)} title={t('ride.changeDestination')}>
        <T v="bodyBold">{shortAddress(destPoint)}</T>
        {destPreview ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption">{t('ride.oldPrice')}</T>
              <T v="body" style={{ textDecorationLine: 'line-through' }}>
                {iqd(destPreview.oldFare)}
              </T>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption">{t('ride.newPrice')}</T>
              <T v="h2" color={colors.primaryDark}>
                {iqd(destPreview.finalFare)}
              </T>
            </Row>
            <T v="caption">
              {km(destPreview.distanceKm)} · {minutes(destPreview.durationMin)}
            </T>
            <Button title={t('ride.confirmNewDestination')} loading={busy} onPress={confirmDestination} />
          </>
        ) : (
          <T v="caption">{t('book.calculating')}</T>
        )}
      </BottomModal>
    </View>
  );
}

function StatusHeader({ ride, track }: { ride: Ride; track: Tracking | null }) {
  const { t } = useTranslation();
  const s = ride.status;
  const d = ride.serviceType === 'delivery';
  const title =
    s === 'DRIVER_ASSIGNED'
      ? t(d ? 'delivery.assigned' : 'ride.assigned')
      : s === 'DRIVER_EN_ROUTE'
        ? t(d ? 'delivery.enRoute' : 'ride.enRoute')
        : s === 'DRIVER_ARRIVED'
          ? t(d ? 'delivery.arrived' : 'ride.arrived')
          : t(d ? 'delivery.inTrip' : 'ride.inTrip');
  return (
    <View style={[styles.statusBox, s === 'DRIVER_ARRIVED' && { backgroundColor: colors.success }]}>
      <T v="h3" color={colors.white}>
        {title}
      </T>
      {s === 'DRIVER_ARRIVED' ? (
        <T v="small" color={colors.white}>
          {d ? t('delivery.arrivedHint') : t('ride.arrivedHint')}
        </T>
      ) : track ? (
        <T v="small" color={colors.primaryMuted}>
          {s === 'IN_TRIP' ? `${t('ride.remaining', { km: km(track.remainingKm) })} · ${t('ride.arrivalIn', { min: track.etaMin })}` : `${t('ride.arrivesIn', { min: track.etaMin })} · ${km(track.remainingKm)}`}
        </T>
      ) : null}
      {ride.paused ? (
        <T v="small" color={colors.white}>
          {t('ride.paused')}
        </T>
      ) : null}
    </View>
  );
}

/** تفاصيل طلب التوصيل: صورة الطلب، النوع، المستلم */
function DeliveryCard({ ride }: { ride: Ride }) {
  const { t } = useTranslation();
  const d = ride.delivery;
  if (!d) return null;
  const photo = fileUrl(d.photoUrl);
  return (
    <View style={styles.deliveryCard}>
      {photo ? <Image source={{ uri: photo }} style={styles.pkgPhoto} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyBold">{t(`itemTypes.${d.itemType}`, { defaultValue: d.itemType })}</T>
        {d.merchant ? (
          <T v="small" color={colors.primary}>
            {t('delivery.fromMerchant', { store: d.merchant.storeName })}
          </T>
        ) : null}
        {d.recipientName || d.recipientPhone ? (
          <T v="small">
            {t('delivery.recipient')}: {d.recipientName ?? ''} {d.recipientPhone ? ltr(d.recipientPhone) : ''}
          </T>
        ) : null}
        {ride.note ? <T v="small">{ride.note}</T> : null}
      </View>
    </View>
  );
}

function TripSummary({ ride }: { ride: Ride }) {
  const { t } = useTranslation();
  return (
    <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md, gap: 6 }}>
      <Row>
        <Icon name="alpha-a-circle" color={colors.primary} size={20} />
        <T v="body" numberOfLines={1} style={{ flex: 1 }}>
          {shortAddress(ride.pickup)}
        </T>
      </Row>
      {ride.stops.map((p, i) => (
        <Row key={i}>
          <Icon name="alpha-b-circle" color={colors.primaryLight} size={20} />
          <T v="body" numberOfLines={1} style={{ flex: 1 }}>
            {shortAddress(p)}
          </T>
        </Row>
      ))}
      <Row>
        <Icon name="map-marker" color={colors.primaryDark} size={20} />
        <T v="body" numberOfLines={1} style={{ flex: 1 }}>
          {shortAddress(ride.dropoff)}
        </T>
      </Row>
      <Divider />
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="caption">
          {km(ride.distanceKm)} · {minutes(ride.durationMin)} · {t('book.cash')}
        </T>
        <PriceText final={ride.fare.finalFare} before={ride.fare.discount ? ride.fare.fareBeforeDiscount : undefined} />
      </Row>
    </View>
  );
}

function FareBreakdown({ ride }: { ride: Ride }) {
  const { t } = useTranslation();
  const rows: [string, number][] = [
    [t('ride.baseFare'), ride.fare.baseFare],
    [t('ride.distanceFare'), ride.fare.distanceFare],
    ...(ride.fare.arrivalFare ? ([[t('ride.arrivalFare'), ride.fare.arrivalFare]] as [string, number][]) : []),
    ...(ride.fare.penaltyFare ? ([[t('ride.penaltyFare'), ride.fare.penaltyFare]] as [string, number][]) : []),
    ...(ride.fare.discount ? ([[t('ride.discount'), -ride.fare.discount]] as [string, number][]) : []),
  ];
  return (
    <View style={{ gap: 4 }}>
      <T v="caption">{t('ride.fareBreakdown')}</T>
      {rows.map(([label, v]) => (
        <Row key={label} style={{ justifyContent: 'space-between' }}>
          <T v="small">{label}</T>
          <T v="small" color={v < 0 ? colors.success : colors.textSoft}>
            {v < 0 ? `− ${iqd(-v)}` : iqd(v)}
          </T>
        </Row>
      ))}
      <T v="small">
        {km(ride.distanceKm)}
        {ride.waitingSeconds > 60 ? ` · ${t('ride.waiting', { min: Math.round(ride.waitingSeconds / 60) })}` : ''}
      </T>
    </View>
  );
}

function Action({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4, width: 76 }}>
      <View style={[styles.action, danger && { backgroundColor: colors.dangerSoft }]}>
        <Icon name={icon} color={danger ? colors.danger : colors.primary} />
      </View>
      <T v="small" center numberOfLines={2} color={danger ? colors.danger : colors.textSoft}>
        {label}
      </T>
    </Pressable>
  );
}

/** حركة بسيطة حول موقع الزبون أثناء البحث */
function Pulse() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {[0, 0.33, 0.66].map((offset) => {
        const p = Animated.modulo(Animated.add(v, offset), 1);
        return (
          <Animated.View
            key={offset}
            style={{
              position: 'absolute',
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: colors.primary,
              opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
              transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.4] }) }],
            }}
          />
        );
      })}
      <View style={styles.pulseCore}>
        <Icon name="car" color={colors.white} size={26} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBox: { backgroundColor: colors.primary, borderRadius: radius.md, padding: space.md, gap: 2 },
  check: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  fareBox: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: 2 },
  action: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  numberPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  deliveryCard: { flexDirection: 'row', gap: space.md, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  pkgPhoto: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.border },
  pulseCore: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white },
});
