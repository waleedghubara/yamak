import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdBanner, ReasonModal, SosButton, SosModal } from '../../components/common';
import { Avatar, BottomModal, Button, Card, Divider, Icon, IconButton, Row, Screen, Sheet, T } from '../../components/ui';
import { YMap, type MapMarker, type YMapHandle } from '../../components/YMap';
import { CAPTAIN_LOCATION_INTERVAL_MS, KIRKUK_CENTER } from '../../config';
import { api, ApiError, fileUrl } from '../../lib/api';
import { callPhone, currentPosition, errorText, openWhatsApp, requestLocationPermission, showError } from '../../lib/device';
import { NavHud } from '../../components/NavHud';
import { cumulative, progress, type NavRoute } from '../../lib/nav';
import { getFix, useMyLocation } from '../../lib/location';
import { iqd, km, ltr, minutes, shortAddress } from '../../lib/format';
import { DebtMeter } from '../../components/DebtMeter';
import { CAPTAIN_ACTIVE, type Offer, type Ride, type Tracking } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { useAuth } from '../../state/auth';
import { KEYS, storage } from '../../lib/storage';
import { startBackgroundLocation, stopBackgroundLocation } from '../../lib/bgLocation';
import { useSocket, useSocketEvent } from '../../state/socket';
import { colors, fonts, radius, shadow, space } from '../../theme';

export interface CaptainSummary {
  today: { trips: number; cash: number; commission: number; discounts: number };
  balanceOwed: number;
  warnAt: number;
  maxDebt: number;
  state: 'ok' | 'warning' | 'blocked';
  paymentInfo: string | null;
  commissionPercent: number;
  /** عمولة ثابتة على كل رحلة (د.ع) */
  commissionFixed?: number;
  rating: number | null;
  totalTrips: number;
  pendingReceipt: { id: string; amount: number; createdAt: string } | null;
}
type Summary = CaptainSummary;

/**
 * الشاشة الرئيسية للكابتن:
 *   متصل/غير متصل ← يرسل موقعه كل 4 ثواني ← يوصله طلب (مهلة للرد) ← قبول
 *   ← انطلق للزبون ← وصلت ← ابدأ الرحلة ← إنهاء ← يستلم المبلغ نقداً
 */
export default function CaptainHome() {
  const { me } = useAuth();
  if (!me?.captain) return <Redirect href="/captain/apply" />;
  if (me.captain.status !== 'approved') return <CaptainStatus />;
  return <CaptainDashboard />;
}

function CaptainDashboard() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const insets = useSafeAreaInsets();
  const { refreshMe } = useAuth();
  const { socket, reconnects } = useSocket();
  const map = useRef<YMapHandle>(null);

  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  // موقعي فوراً (آخر موقع معروف) — حتى الخريطة تفتح على مكان الكابتن مباشرة
  const [start] = useState(() => getFix());
  const [pos, setPos] = useState<{ lat: number; lng: number; heading: number | null } | null>(() =>
    start ? { lat: start.lat, lng: start.lng, heading: start.heading } : null,
  );
  const centered = useRef(!!start);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ fare: number; balance: number } | null>(null);
  const [modal, setModal] = useState<null | 'cancel' | 'sos'>(null);
  const watch = useRef<Location.LocationSubscription | null>(null);
  const onlineRef = useRef(false);
  // ───── الملاحة داخل التطبيق (بدل Waze) ─────
  // المسار والمناورات من السيرفر، وموقع دقيق كل ثانية للشاشة بس (الإرسال للسيرفر يبقى كل 4 ثواني)
  const [navOn, setNavOn] = useState(false);
  const [nav, setNav] = useState<NavRoute | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [navPos, setNavPos] = useState<{ lat: number; lng: number; heading: number | null; speed: number | null } | null>(null);
  const [followPaused, setFollowPaused] = useState(false);
  const navWatch = useRef<Location.LocationSubscription | null>(null);
  const navFetchedAt = useRef(0);
  const offRoute = useRef(0);
  const navCum = useMemo(() => (nav ? cumulative(nav.geometry) : []), [nav]);
  const prog = useMemo(() => (nav && navPos ? progress(nav, navCum, navPos) : null), [nav, navCum, navPos]);

  const fetchNav = useCallback(async (r: Ride, p: { lat: number; lng: number }) => {
    navFetchedAt.current = Date.now();
    offRoute.current = 0;
    const res = await api<NavRoute>(`/api/captain/rides/${r.id}/nav`, { query: { lat: p.lat, lng: p.lng } });
    setNav(res);
    return res;
  }, []);

  const stopNav = useCallback(() => {
    setNavOn(false);
    setNav(null);
    setFollowPaused(false);
    navWatch.current?.remove();
    navWatch.current = null;
    map.current?.unfollow();
  }, []);

  const startNav = useCallback(
    async (r: Ride) => {
      setNavOn(true);
      setFollowPaused(false);
      setNavLoading(true);
      try {
        if (!navWatch.current) {
          navWatch.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
            (l) => setNavPos({ lat: l.coords.latitude, lng: l.coords.longitude, heading: l.coords.heading ?? null, speed: l.coords.speed ?? null }),
          );
        }
        const p = navPos ?? pos ?? (await currentPosition());
        if (!p) throw new ApiError(0, 'location_unavailable');
        await fetchNav(r, p);
      } catch (err) {
        showError(err);
      } finally {
        setNavLoading(false);
      }
    },
    [fetchNav, navPos, pos],
  );

  useEffect(() => () => navWatch.current?.remove(), []);

  // الرحلة خلصت أو انلغت ← نطلع من الملاحة
  useEffect(() => {
    if (!ride && navOn) stopNav();
  }, [ride, navOn, stopNav]);

  // كل موقع جديد: الكاميرا تتبع السيارة، وإذا طلع عن الطريق نعيد حساب المسار
  useEffect(() => {
    if (!navOn || !nav || !navPos || !prog) return;
    const moving = (navPos.speed ?? 0) > 2 && navPos.heading != null && navPos.heading >= 0;
    if (!followPaused) map.current?.follow(navPos, moving ? navPos.heading! : prog.roadBearing);
    offRoute.current = prog.offRouteM > 50 && !prog.arrived ? offRoute.current + 1 : 0;
    if (ride && offRoute.current >= 3 && Date.now() - navFetchedAt.current > 8000) {
      setRerouting(true);
      fetchNav(ride, navPos)
        .catch(() => {})
        .finally(() => setRerouting(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navPos, nav]);

  const loadSummary = useCallback(() => {
    api<Summary>('/api/captain/summary').then(setSummary).catch(() => {});
  }, []);

  const loadActive = useCallback(() => {
    api<Ride | null>('/api/rides/active')
      .then((r) => setRide(r && CAPTAIN_ACTIVE.includes(r.status) ? r : null))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
      loadActive();
    }, [loadSummary, loadActive]),
  );

  // ───── تتبع الموقع ─────

  const startWatch = useCallback(async () => {
    if (watch.current) return true;
    if (!(await requestLocationPermission())) {
      Alert.alert('', t('captain.locationNeeded'));
      return false;
    }
    watch.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: CAPTAIN_LOCATION_INTERVAL_MS, distanceInterval: 10 },
      (l) => {
        const p = { lat: l.coords.latitude, lng: l.coords.longitude, heading: l.coords.heading ?? null };
        setPos(p);
        if (!centered.current) {
          centered.current = true;
          map.current?.flyTo(p, 15);
        }
        socket?.emit('captain:location', { ...p, accuracy: l.coords.accuracy });
      },
    );
    return true;
  }, [socket, t]);

  const stopWatch = useCallback(() => {
    watch.current?.remove();
    watch.current = null;
  }, []);

  // إذا تغير الاتصال (socket جديد) نعيد تشغيل المراقبة حتى ترسل على الاتصال الجديد
  useEffect(() => {
    if (watch.current) {
      stopWatch();
      if (onlineRef.current || ride) startWatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  useEffect(() => {
    return () => {
      stopWatch();
      deactivateKeepAwake();
    };
  }, [stopWatch]);

  // وهو غير متصل: الخريطة تتبع موقعه من مخزن الموقع (المراقبة اللي ترسل للسيرفر تشتغل بس وهو متصل)
  const { fix } = useMyLocation(!online && !ride);
  useEffect(() => {
    if (!fix || watch.current) return;
    setPos({ lat: fix.lat, lng: fix.lng, heading: fix.heading });
    if (!centered.current) {
      centered.current = true;
      map.current?.flyTo(fix, 15);
    }
  }, [fix]);

  // الموقع بالخلفية (التطبيق بالخلفية / الشاشة مطفية) طول ما الكابتن متصل أو عنده رحلة.
  // منفصل عن المراقبة بالواجهة حتى إعادة اتصال الـ socket ما توقفه.
  const wantBackground = online || !!ride;
  useEffect(() => {
    if (!wantBackground) {
      stopBackgroundLocation();
      return;
    }
    const start = () => startBackgroundLocation({ title: t('captain.bgTitle'), body: t('captain.bgBody') });
    start();
    // أندرويد ما يسمح يبدي الخدمة والتطبيق بالخلفية — نعيد المحاولة أول ما يرجع للواجهة
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') start();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantBackground]);

  // أثناء الرحلة نرسل الموقع حتى لو الكابتن طفى الاستقبال
  useEffect(() => {
    if (ride) startWatch();
    else if (!onlineRef.current) stopWatch();
  }, [ride, startWatch, stopWatch]);

  const setOnlineState = useCallback(
    async (want: boolean, silent = false) => {
      setToggling(true);
      try {
        if (want) {
          if (!(await startWatch())) return;
          const p = await currentPosition();
          await api('/api/captain/online', { body: { online: true, ...(p ? { lat: p.lat, lng: p.lng } : {}) } });
          if (p) socket?.emit('captain:location', { lat: p.lat, lng: p.lng, heading: null, accuracy: p.accuracy });
          activateKeepAwakeAsync().catch(() => {});
        } else {
          await api('/api/captain/online', { body: { online: false } });
          if (!ride) stopWatch();
          deactivateKeepAwake();
        }
        onlineRef.current = want;
        setOnline(want);
        await storage.set(KEYS.captainOnline, want ? '1' : '0');
      } catch (err) {
        if (!silent) showError(err);
        if (err instanceof ApiError && err.code === 'debt_limit') {
          onlineRef.current = false;
          setOnline(false);
          await storage.set(KEYS.captainOnline, '0');
        }
      } finally {
        setToggling(false);
      }
    },
    [ride, socket, startWatch, stopWatch],
  );

  // نرجع لحالة الاتصال المحفوظة، ونعيد التسجيل بعد كل إعادة اتصال (لو السيرفر انعاد تشغيله)
  useEffect(() => {
    if (!socket || reconnects === 0) return;
    (async () => {
      const saved = (await storage.get(KEYS.captainOnline)) === '1';
      if (saved) setOnlineState(true, true);
    })();
    loadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnects]);

  // ───── أحداث السيرفر ─────

  useSocketEvent<Offer>('ride:offer', (o) => {
    setOffer(o);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  });
  useSocketEvent<{ rideId: string }>('ride:offer_cancelled', (d) => {
    setOffer((o) => (o?.rideId === d.rideId ? null : o));
  });
  useSocketEvent<Ride>('ride:update', (r) => {
    if (CAPTAIN_ACTIVE.includes(r.status)) {
      setRide(r);
      return;
    }
    setRide((cur) => {
      if (cur?.id === r.id) {
        if (r.status === 'CANCELLED_BY_CUSTOMER') Alert.alert('', t('captain.customerCancelled'));
        loadSummary();
        return null;
      }
      return cur;
    });
  });
  useSocketEvent<Tracking>('ride:tracking', setTracking);
  useSocketEvent<{ online?: boolean; reason?: string; status?: string; balanceOwed?: number; maxDebt?: number }>('captain:status', (d) => {
    if (d.online === false) {
      onlineRef.current = false;
      setOnline(false);
      storage.set(KEYS.captainOnline, '0');
      if (d.reason === 'debt_limit')
        Alert.alert(t('captain.debt.blockedTitle'), t('captain.debt.blockedBody'), [
          { text: t('common.close'), style: 'cancel' },
          { text: t('captain.debt.payNow'), onPress: () => router.navigate('/(captain)/earnings') },
        ]);
    }
    if (d.reason === 'debt_warning') {
      Alert.alert(t('captain.debt.warningTitle'), t('captain.debt.warningBody', { max: iqd(d.maxDebt ?? 15000) }), [
        { text: t('common.ok'), style: 'cancel' },
        { text: t('captain.debt.payNow'), onPress: () => router.navigate('/(captain)/earnings') },
      ]);
    }
    if (d.reason === 'receipt_rejected') Alert.alert('', t('captain.receipt.rejected'));
    refreshMe();
    loadSummary();
  });

  // ───── الإجراءات ─────

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'offer_expired') {
        setOffer(null);
        Alert.alert('', errorText(err));
      } else showError(err);
    } finally {
      setBusy(false);
    }
  };

  const accept = () =>
    act(async () => {
      if (!offer) return;
      const r = await api<Ride>(`/api/captain/rides/${offer.rideId}/accept`, { body: {} });
      setOffer(null);
      setRide(r);
      map.current?.fitTo([r.pickup, ...(pos ? [pos] : [])], { top: 160, bottom: 380, left: 60, right: 60 });
    });

  const decline = () => {
    if (offer) api(`/api/captain/rides/${offer.rideId}/decline`, { body: {} }).catch(() => {});
    setOffer(null);
  };

  const step = (path: 'en-route' | 'arrived' | 'start') =>
    act(async () => {
      if (!ride) return;
      const r = await api<Ride>(`/api/captain/rides/${ride.id}/${path}`, { body: {} });
      setRide(r);
      // الملاحة تبدأ وحدها: للزبون بعد «انطلق»، وللوجهة بعد ركوب الزبون
      if (path === 'en-route' || path === 'start') startNav(r);
    });

  const complete = () => {
    const delivery = ride?.serviceType === 'delivery';
    Alert.alert(delivery ? t('captain.delivered') : t('captain.endTrip'), delivery ? t('captain.deliveredConfirm') : t('captain.endTripConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: delivery ? t('captain.delivered') : t('captain.endTrip'),
        onPress: () =>
          act(async () => {
            if (!ride) return;
            const r = await api<{ ride: Ride; balanceOwed: number }>(`/api/captain/rides/${ride.id}/complete`, { body: {} });
            setDone({ fare: r.ride.fare.finalFare, balance: r.balanceOwed });
            setRide(null);
            setTracking(null);
            loadSummary();
            refreshMe();
          }),
      },
    ]);
  };

  const cancel = async (reason: string) => {
    if (!ride) return;
    await api(`/api/captain/rides/${ride.id}/cancel`, { body: { reason } });
    setRide(null);
    setModal(null);
    loadSummary();
  };

  // ───── الخريطة ─────

  const markers: MapMarker[] = [];
  if (ride) {
    markers.push({ id: 'pickup', kind: 'pickup', ...ride.pickup });
    ride.stops.forEach((p, i) => markers.push({ id: `stop${i}`, kind: 'stop', ...p }));
    markers.push({ id: 'dropoff', kind: 'dropoff', ...ride.dropoff });
  } else if (offer) {
    markers.push({ id: 'offer-pickup', kind: 'pickup', ...offer.pickup });
  }
  const route = ride && tracking?.rideId === ride.id ? tracking.geometry : null;
  const debtBlocked = summary ? summary.state === 'blocked' || summary.balanceOwed >= summary.maxDebt : false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <YMap
        ref={map}
        initialCenter={start ?? KIRKUK_CENTER}
        initialZoom={start ? 15 : 13}
        markers={markers}
        route={navOn && prog ? prog.ahead : navOn && nav ? nav.geometry : route}
        vehicle={navOn && navPos ? navPos : pos}
        onMoveStart={() => navOn && setFollowPaused(true)}
      />

      {navOn && ride ? (
        <NavHud
          route={nav}
          prog={prog}
          loading={navLoading}
          rerouting={rerouting}
          paused={followPaused}
          onExit={stopNav}
          onRecenter={() => setFollowPaused(false)}
        />
      ) : (
      /* الأعلى: حالة الاتصال + ملخص اليوم */
      <View style={[styles.top, { top: insets.top + space.sm }]}>
        <Pressable
          onPress={() => !ride && !toggling && setOnlineState(!online)}
          style={[styles.status, { backgroundColor: online ? colors.success : colors.text }]}
        >
          <View style={[styles.dot, { backgroundColor: online ? '#7CF0B0' : colors.muted }]} />
          <T v="bodyBold" color={colors.white}>
            {online ? t('captain.online') : t('captain.offline')}
          </T>
        </Pressable>
        {summary ? (
          <Row style={styles.stats}>
            <Stat label={t('captain.todayTrips')} value={String(summary.today.trips)} />
            <Stat label={t('captain.todayCash')} value={iqd(summary.today.cash)} />
            <Stat label={t('captain.owed')} value={iqd(summary.balanceOwed)} danger={debtBlocked} />
          </Row>
        ) : null}
      </View>
      )}

      <Sheet scroll style={{ maxHeight: navOn ? '40%' : '58%' }}>
        <IconButton
          name="crosshairs-gps"
          color={colors.primary}
          onPress={() => (navOn ? setFollowPaused(false) : pos && map.current?.flyTo(pos, 16))}
          style={styles.recenter}
        />

        {ride ? (
          <ActiveRidePanel
            ride={ride}
            tracking={tracking?.rideId === ride.id ? tracking : null}
            busy={busy}
            onEnRoute={() => step('en-route')}
            onArrived={() => step('arrived')}
            onStart={() => step('start')}
            onComplete={complete}
            onCancel={() => setModal('cancel')}
            onSos={() => setModal('sos')}
            navOn={navOn}
            onNavToggle={() => (navOn ? stopNav() : startNav(ride))}
          />
        ) : (
          <>
            {summary && summary.state !== 'ok' ? (
              <Pressable onPress={() => router.navigate('/(captain)/earnings')}>
                <DebtMeter balance={summary.balanceOwed} warnAt={summary.warnAt} maxDebt={summary.maxDebt} pendingReceipt={!!summary.pendingReceipt} compact />
              </Pressable>
            ) : null}
            <T v="h2" center>
              {online ? t('captain.waitingOffers') : t('captain.offlineHint')}
            </T>
            {online ? (
              <T v="caption" center>
                {t('captain.keepOpen')}
              </T>
            ) : null}
            <Button
              title={online ? t('captain.goOffline') : t('captain.goOnline')}
              kind={online ? 'ghost' : 'primary'}
              icon="power"
              loading={toggling}
              disabled={!online && debtBlocked}
              onPress={() => setOnlineState(!online)}
            />
            <AdBanner app="captain" />
          </>
        )}
      </Sheet>

      {/* طلب جديد */}
      {/* لازم الكابتن يختار قبول أو رفض — الضغط خارج النافذة ما يسكرها */}
      <BottomModal visible={!!offer} onClose={() => {}}>
        {offer ? <OfferCard offer={offer} busy={busy} onAccept={accept} onDecline={decline} onExpire={() => setOffer(null)} /> : null}
      </BottomModal>

      {/* بعد إنهاء الرحلة: المبلغ نقداً */}
      <BottomModal visible={!!done} onClose={() => setDone(null)}>
        {done ? (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Icon name="check-circle" size={56} color={colors.success} />
            <T v="h2">{t('captain.collectCash')}</T>
            <T style={{ fontFamily: fonts.black, fontSize: 38, lineHeight: 54, color: colors.primaryDark }}>{iqd(done.fare)}</T>
            <T v="caption">{t('captain.newBalance', { amount: iqd(done.balance) })}</T>
            <Button title={t('common.done')} style={{ alignSelf: 'stretch' }} onPress={() => setDone(null)} />
          </View>
        ) : null}
      </BottomModal>

      {ride ? (
        <>
          <ReasonModal
            visible={modal === 'cancel'}
            title={t('captain.cancelReasonTitle')}
            reasons={cfg.lists.cancelReasonsCaptain}
            labelPrefix="reasons"
            confirmLabel={t('ride.cancelRide')}
            onClose={() => setModal(null)}
            onSubmit={cancel}
          />
          <SosModal visible={modal === 'sos'} rideId={ride.id} onClose={() => setModal(null)} />
        </>
      ) : null}
    </View>
  );
}

function OfferCard({ offer, busy, onAccept, onDecline, onExpire }: { offer: Offer; busy: boolean; onAccept: () => void; onDecline: () => void; onExpire: () => void }) {
  const { t } = useTranslation();
  const calc = () => Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => {
      const l = calc();
      setLeft(l);
      if (l <= 0) onExpire();
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.rideId]);
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ flex: 1 }}>
          {offer.serviceType === 'delivery' ? <Icon name="package-variant-closed" color={colors.warning} size={26} /> : null}
          <T v="h2">{offer.serviceType === 'delivery' ? t('captain.newDelivery') : t('captain.newRequest')}</T>
          {offer.number ? <T v="caption">#{offer.number}</T> : null}
        </Row>
        <View style={styles.timer}>
          <T v="bodyBold" color={colors.white}>
            {t('captain.secondsLeft', { sec: left })}
          </T>
        </View>
      </Row>
      <View style={styles.fareBig}>
        <T v="caption">{t('captain.fareCash')}</T>
        <T style={{ fontFamily: fonts.black, fontSize: 34, lineHeight: 48, color: colors.primaryDark }}>{iqd(offer.fare)}</T>
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="bodyBold" color={colors.primary}>
          {t('captain.pickupDistance', { km: km(offer.pickupDistanceKm) })}
        </T>
        <T v="caption">
          {t('captain.tripDistance')}: {km(offer.distanceKm)} · {minutes(offer.durationMin)}
        </T>
      </Row>
      {offer.delivery ? <DeliveryBox d={offer.delivery} note={offer.note} /> : null}
      <Card style={{ padding: space.md, gap: 6 }}>
        <Row>
          <Icon name="alpha-a-circle" color={colors.primary} size={20} />
          <T v="body" numberOfLines={2} style={{ flex: 1 }}>
            {shortAddress(offer.pickup)}
          </T>
        </Row>
        {offer.stops.map((s, i) => (
          <Row key={i}>
            <Icon name="alpha-b-circle" color={colors.primaryLight} size={20} />
            <T v="body" numberOfLines={1} style={{ flex: 1 }}>
              {shortAddress(s)}
            </T>
          </Row>
        ))}
        <Row>
          <Icon name="map-marker" color={colors.primaryDark} size={20} />
          <T v="body" numberOfLines={2} style={{ flex: 1 }}>
            {shortAddress(offer.dropoff)}
            {offer.roundTrip ? ` (${t('book.roundTrip')})` : ''}
          </T>
        </Row>
      </Card>
      <Row>
        <Button title={t('captain.decline')} kind="ghost" style={{ flex: 1 }} onPress={onDecline} />
        <Button title={t('captain.accept')} style={{ flex: 2 }} loading={busy} onPress={onAccept} />
      </Row>
    </View>
  );
}

function ActiveRidePanel({
  ride,
  tracking,
  busy,
  onEnRoute,
  onArrived,
  onStart,
  onComplete,
  onCancel,
  onSos,
  navOn,
  onNavToggle,
}: {
  ride: Ride;
  tracking: Tracking | null;
  busy: boolean;
  onEnRoute: () => void;
  onArrived: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onSos: () => void;
  navOn: boolean;
  onNavToggle: () => void;
}) {
  const { t } = useTranslation();
  const s = ride.status;
  const inTrip = s === 'IN_TRIP';
  const isDelivery = ride.serviceType === 'delivery';
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T v="h3">{isDelivery ? t(`captain.deliveryStatus.${s}`, { defaultValue: t(`status.${s}`) }) : t(`status.${s}`)}</T>
          {ride.number ? <T v="small">#{ride.number}</T> : null}
        </View>
        {/* الملاحة داخل التطبيق: للزبون قبل الركوب، وللوجهة بعد الركوب */}
        <Pressable onPress={onNavToggle} style={[styles.navPill, navOn && { backgroundColor: colors.text }]} hitSlop={6}>
          <Icon name={navOn ? 'close' : 'navigation-variant'} size={20} color={colors.white} />
          <T style={styles.navPillText}>{navOn ? t('nav.stop') : inTrip ? t('nav.toDropoff') : t('nav.toPickup')}</T>
        </Pressable>
        <SosButton onTrigger={onSos} />
      </Row>
      {tracking && !navOn ? (
        <T v="caption">
          {km(tracking.remainingKm)} · {minutes(tracking.etaMin)}
        </T>
      ) : null}
      {ride.paused ? (
        <View style={styles.warn}>
          <T v="small" color={colors.warning}>
            {t('captain.customerPaused')}
          </T>
        </View>
      ) : null}

      {/* الزر الرئيسي فوق حتى يبقى ظاهر بدون تمرير */}
      <Row>
        {s === 'DRIVER_ASSIGNED' ? <Button title={t('captain.navigateToCustomer')} loading={busy} style={{ flex: 1 }} onPress={onEnRoute} /> : null}
        {s === 'DRIVER_EN_ROUTE' ? <Button title={t('captain.arrivedBtn')} loading={busy} style={{ flex: 1 }} onPress={onArrived} /> : null}
        {s === 'DRIVER_ARRIVED' ? (
          <Button title={isDelivery ? t('captain.pickedUp') : t('captain.startTrip')} kind="success" loading={busy} style={{ flex: 1 }} onPress={onStart} />
        ) : null}
        {inTrip ? (
          <Button title={isDelivery ? t('captain.delivered') : t('captain.endTrip')} kind="danger" loading={busy} style={{ flex: 1 }} onPress={onComplete} />
        ) : null}
      </Row>

      <Row gap={space.md}>
        <Avatar uri={ride.customer?.photoUrl} name={ride.customer?.name} size={48} />
        <View style={{ flex: 1 }}>
          <T v="small">{t('captain.customer')}</T>
          <T v="h3" numberOfLines={1}>
            {ride.customer?.name ?? '—'}
          </T>
        </View>
        {/* تواصل ويا الزبون: اتصال، واتساب، أو مراسلة داخل التطبيق */}
        <IconButton name="phone" bg={colors.primarySoft} color={colors.primary} onPress={() => callPhone(ride.customer?.phone)} />
        <IconButton name="whatsapp" bg="#E7F8EE" color="#1FA855" onPress={() => openWhatsApp(ride.customer?.phone)} />
        <IconButton name="message-text" bg={colors.primarySoft} color={colors.primary} onPress={() => router.push(`/chat/${ride.id}`)} />
      </Row>

      {ride.delivery ? <DeliveryBox d={ride.delivery} note={ride.note} canCall /> : null}

      <Card style={{ padding: space.md, gap: 6 }}>
        <Row>
          <Icon name="alpha-a-circle" color={colors.primary} size={20} />
          <T v="body" numberOfLines={2} style={{ flex: 1 }}>
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
          <T v="body" numberOfLines={2} style={{ flex: 1 }}>
            {shortAddress(ride.dropoff)}
            {ride.roundTrip ? ` (${t('book.roundTrip')})` : ''}
          </T>
        </Row>
        {ride.note && !isDelivery ? <T v="caption">{ride.note}</T> : null}
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="caption">{t('captain.fareCash')}</T>
          <T v="h3" color={colors.primaryDark}>
            {iqd(ride.fare.finalFare)}
          </T>
        </Row>
      </Card>

      {!inTrip ? <Button title={t('ride.cancelRide')} kind="ghost" small onPress={onCancel} /> : null}
    </View>
  );
}

/** طلب توصيل: صورة الطلب (إخلاء مسؤولية الكابتن) + النوع + التاجر + المستلم */
function DeliveryBox({
  d,
  note,
  canCall,
}: {
  d: { itemType: string; photoUrl: string | null; merchant: { storeName: string } | null; recipientName?: string | null; recipientPhone?: string | null };
  note: string | null;
  canCall?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const photo = fileUrl(d.photoUrl);
  return (
    <View style={styles.deliveryBox}>
      {photo ? (
        <Pressable onPress={() => setOpen(true)}>
          <Image source={{ uri: photo }} style={styles.pkg} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyBold">{t(`itemTypes.${d.itemType}`, { defaultValue: d.itemType })}</T>
        {d.merchant ? (
          <Row gap={4}>
            <Icon name="storefront-outline" size={16} color={colors.primary} />
            <T v="small" color={colors.primary}>
              {d.merchant.storeName}
            </T>
          </Row>
        ) : null}
        {d.recipientName || d.recipientPhone ? (
          <T v="small">
            {t('delivery.recipient')}: {d.recipientName ?? ''} {d.recipientPhone ? ltr(d.recipientPhone) : ''}
          </T>
        ) : null}
        {note ? <T v="small">{note}</T> : null}
      </View>
      {canCall && d.recipientPhone ? (
        <IconButton name="phone-forward" bg={colors.white} color={colors.primary} onPress={() => callPhone(d.recipientPhone)} />
      ) : null}
      <BottomModal visible={open} onClose={() => setOpen(false)} title={t('delivery.photo')}>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md }} resizeMode="contain" /> : null}
        <T v="small">{t('delivery.photoCaptainHint')}</T>
      </BottomModal>
    </View>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <T v="small" numberOfLines={1}>
        {label}
      </T>
      <T v="bodyBold" color={danger ? colors.danger : colors.text} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

/** الكابتن قبل الموافقة: قيد المراجعة / مرفوض / موقوف */
function CaptainStatus() {
  const { t } = useTranslation();
  const { me, refreshMe, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const s = me!.captain!.status;
  const title = s === 'pending' ? t('captain.pendingTitle') : s === 'rejected' ? t('captain.rejectedTitle') : t('captain.blockedTitle');
  const body = s === 'pending' ? t('captain.pendingBody') : s === 'rejected' ? t('captain.rejectedBody') : t('captain.blockedBody');
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.xl, gap: space.lg, justifyContent: 'center' }}>
        <View style={{ alignSelf: 'center', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={s === 'pending' ? 'timer-sand' : 'information-outline'} size={54} color={colors.primary} />
        </View>
        <T v="h1" center>
          {title}
        </T>
        <T v="body" center color={colors.textSoft}>
          {body}
        </T>
        {me?.captain?.adminNote ? (
          <Card>
            <T v="caption">{me.captain.adminNote}</T>
          </Card>
        ) : null}
        <Button
          title={t('captain.refresh')}
          icon="refresh"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await refreshMe();
            setBusy(false);
          }}
        />
        {s === 'rejected' ? <Button title={t('captain.reapply')} kind="secondary" onPress={() => router.push('/captain/apply')} /> : null}
        <Button title={t('support.title')} kind="ghost" icon="headset" onPress={() => router.push('/support')} />
        <Button
          title={t('account.logout')}
          kind="ghost"
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm },
  status: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.pill, ...shadow },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stats: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md, ...shadow },
  recenter: { position: 'absolute', top: -60, end: space.lg },
  warn: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md },
  timer: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 4 },
  fareBig: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.md },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginEnd: space.sm },
  navPillText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12, lineHeight: 18 },
  deliveryBox: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.md },
  pkg: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
});
