import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Image, Pressable, ScrollView, StyleSheet, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReasonModal, SosButton, SosModal } from '../../components/common';
import { Avatar, BottomModal, Button, Card, Divider, FullModal, Icon, IconButton, ListItem, Row, Screen, Sheet, T, type IconName } from '../../components/ui';
import { YMap, type MapMarker, type YMapHandle } from '../../components/YMap';
import { CAPTAIN_LOCATION_INTERVAL_MS, KIRKUK_CENTER } from '../../config';
import { loadHomeFeed } from '../../lib/home';
import { openNavApp } from '../../lib/navApp';
import { getCached, sendOrQueue } from '../../lib/offline';
import { api, ApiError, fileUrl } from '../../lib/api';
import { callPhone, currentPosition, errorText, openWhatsApp, requestLocationPermission, showError } from '../../lib/device';
import { getFix, makeLocationGate, useMyLocation } from '../../lib/location';
import { iqd, km, ltr, minutes, shortAddress } from '../../lib/format';
import { AccountCircle } from '../../components/AccountCircle';
import { BatteryNotice, useBatteryNotice } from '../../components/BatteryNotice';
import { DebtMeter } from '../../components/DebtMeter';
import { balanceColor, creditOf } from '../../lib/balance';
import { CAPTAIN_ACTIVE, type Offer, type Ride, type Tracking } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { useAuth } from '../../state/auth';
import { KEYS, storage } from '../../lib/storage';
import { startBackgroundLocation, stopBackgroundLocation } from '../../lib/bgLocation';
import { useSocket, useSocketEvent } from '../../state/socket';
import { colors, fonts, radius, shadow, space } from '../../theme';

/** نغمة الطلب الجديد: ثلاث رنّات (6 ثواني) وتسكت — نفس الملف المستعمل برنة إشعار قناة offers */
const RING = require('../../../assets/yamak_ring.wav');

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
  /** المستحقات: الحد الفعلي ويا السلفة، وهل يكدر ياخذ سلفة الطوارئ */
  effectiveMaxDebt?: number;
  advanceAmount?: number;
  advanceActive?: boolean;
  canTakeAdvance?: boolean;
  /** المبلغ المطلوب تسديده كاملاً */
  payInFull?: number;
  /** شحن البطاقات مفعّل؟ (وإلا «قريباً») */
  cardsEnabled?: boolean;
}
type Summary = CaptainSummary;

/**
 * الشاشة الرئيسية للكابتن:
 *   متصل/غير متصل ← يرسل موقعه كل 4 ثواني ← يوصله طلب (مهلة للرد) ← قبول
 *   ← انطلق للزبون ← وصلت ← ابدأ الرحلة ← إنهاء ← يستلم المبلغ نقداً
 */
export default function CaptainHome() {
  const { me } = useAuth();
  // الجلسة انتهت: نرجع لنقطة البداية (تسجيل الدخول)، مو لاستمارة التسجيل ككابتن جديد
  if (!me) return <Redirect href="/" />;
  if (!me.captain) return <Redirect href="/captain/apply" />;
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
  const [done, setDone] = useState<{ fare: number; balance: number | null } | null>(null);
  const [modal, setModal] = useState<null | 'cancel' | 'sos'>(null);
  const [batteryOpen, closeBattery] = useBatteryNotice(online);
  const [sheetH, setSheetH] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [barH, setBarH] = useState(78);
  // وجهان منفصلان: استقبال الطلبات، وتفاصيل الرحلة — والتنقل بينهم بزر
  const [onTrip, setOnTrip] = useState(false);
  const watch = useRef<Location.LocationSubscription | null>(null);
  const sendGate = useRef(makeLocationGate());
  const onlineRef = useRef(false);
  // ───── التتبع المباشر (2D) ─────
  // الكاميرا تتبع السيارة بنعومة وبدون إمالة. إذا المستخدم حرك الخريطة نوقف المتابعة
  // لحد ما يضغط «إعادة التموضع». الملاحة بالمناورات تركناها لتطبيقات الملاحة (زر «افتح بتطبيق ملاحة»).
  const [followPaused, setFollowPaused] = useState(false);
  const following = !!ride && !followPaused;

  useEffect(() => {
    if (!following || !pos) return;
    map.current?.follow(pos, pos.heading ?? 0);
  }, [following, pos]);

  // الرحلة خلصت أو انلغت ← نرجع الخريطة لوضعها الطبيعي
  useEffect(() => {
    if (ride) return;
    map.current?.unfollow();
  }, [ride]);

  const [unread, setUnread] = useState(0);
  const [stale, setStale] = useState(false);
  // كشف الحساب: ينحفظ محلياً حتى يبين وقت انقطاع النت
  const loadSummary = useCallback(() => {
    getCached<Summary>('/api/captain/summary', 'captainSummary')
      .then(({ data, stale }) => {
        if (data) setSummary(data);
        setStale(stale);
      })
      .catch(() => {});
  }, []);

  // الرحلة الفعالة + الإشعارات بطلب واحد (وإذا النت منقطع من اللقطة المحفوظة)
  const loadActive = useCallback(() => {
    loadHomeFeed()
      .then(({ feed }) => {
        setRide(feed.activeRide && CAPTAIN_ACTIVE.includes(feed.activeRide.status) ? feed.activeRide : null);
        setUnread(feed.unread);
      })
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
        // الخريطة تتحدث بكل قراءة، والإرسال كل 4 ثواني متحرك / 15 ثانية واقف
        if (sendGate.current(p)) socket?.emit('captain:location', { ...p, accuracy: l.coords.accuracy });
      },
    );
    return true;
  }, [socket, t]);

  const stopWatch = useCallback(() => {
    sendGate.current = makeLocationGate();
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

  // رحلة جديدة ← يفتح وجه الرحلة، وخلصت ← يرجع لوجه استقبال الطلبات
  const rideId = ride?.id ?? null;
  useEffect(() => {
    const id = setTimeout(() => setOnTrip(!!rideId), 0);
    return () => clearTimeout(id);
  }, [rideId]);

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

  /** خطوات الرحلة. بدون إنترنت: تنحفظ وتنرسل أول ما يرجع الاتصال، والكابتن يكمل شغله */
  const step = (path: 'en-route' | 'arrived' | 'start') =>
    act(async () => {
      if (!ride) return;
      const r = await sendOrQueue<Ride>({
        id: `${ride.id}:${path}`,
        path: `/api/captain/rides/${ride.id}/${path}`,
        method: 'POST',
        body: {},
        label: path,
      });
      if (!r) {
        setRide({ ...ride, status: path === 'en-route' ? 'DRIVER_EN_ROUTE' : path === 'arrived' ? 'DRIVER_ARRIVED' : 'IN_TRIP' });
        Alert.alert('', t('offline.queued'));
        return;
      }
      setRide(r);
      // المتابعة ترجع تلقائياً بأي خطوة جديدة
      setFollowPaused(false);
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
            const r = await sendOrQueue<{ ride: Ride; balanceOwed: number }>({
              id: `${ride.id}:complete`,
              path: `/api/captain/rides/${ride.id}/complete`,
              method: 'POST',
              body: {},
              label: 'complete',
            });
            if (!r) {
              // بدون إنترنت: نقفل الرحلة محلياً وننرسلها أول ما يرجع الاتصال
              setDone({ fare: ride.fare.finalFare, balance: null });
              setRide(null);
              setTracking(null);
              Alert.alert('', t('offline.queued'));
              return;
            }
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

  const go = (path: string) => {
    setMenuOpen(false);
    router.push(path as never);
  };

  // النوافذ المشتركة بين الوجهين (طلب جديد، نهاية الرحلة، البطارية، الإلغاء، الطوارئ)
  const overlays = (
    <>
      {/* خطوة إذن البطارية (أندرويد): حتى ما يوقف النظام إرسال الموقع والشاشة مطفية */}
      <BatteryNotice visible={batteryOpen} onClose={closeBattery} />

      {/* طلب جديد: شاشة كاملة بنمط المكالمة — رنة واهتزاز وعدّاد، ولازم يختار قبول أو رفض */}
      <FullModal visible={!!offer}>
        {offer ? <OfferCard offer={offer} busy={busy} onAccept={accept} onDecline={decline} onExpire={() => setOffer(null)} /> : null}
      </FullModal>

      {/* بعد إنهاء الرحلة: المبلغ نقداً */}
      <BottomModal visible={!!done} onClose={() => setDone(null)}>
        {done ? (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Icon name="check-circle" size={56} color={colors.success} />
            <T v="h2">{t('captain.collectCash')}</T>
            <T style={{ fontFamily: fonts.black, fontSize: 38, lineHeight: 54, color: colors.primaryDark }}>{iqd(done.fare)}</T>
            <T v="caption" color={done.balance == null ? colors.muted : balanceColor(done.balance)}>
              {done.balance == null
                ? t('offline.queued')
                : done.balance > 0
                ? `${t('captain.debt.dueToCompany')}: -${iqd(done.balance)}`
                : `${t('captain.debt.balanceNow')}: ${iqd(creditOf(done.balance))}`}
            </T>
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
    </>
  );

  // ───────── وجه الرحلة: خريطة واضحة بالمسار وتتبع السيارة + تفاصيل الرحلة ─────────
  if (onTrip && ride) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <YMap
          ref={map}
          initialCenter={pos ?? start ?? KIRKUK_CENTER}
          initialZoom={15}
          markers={markers}
          route={route}
          vehicle={pos}
          onMoveStart={() => setFollowPaused(true)}
        />

        {/* شريط فوق الخريطة: حالة الرحلة + رجوع لوجه استقبال الطلبات */}
        <View style={[styles.top, { top: insets.top + space.sm }]}>
          <Pressable onPress={() => setOnTrip(false)} style={styles.tripBar}>
            <Icon name="chevron-right" flip color={colors.white} />
            <T v="bodyBold" color={colors.white} style={{ flex: 1 }}>
              {t(`status.${ride.status}`)}
            </T>
            <T v="small" color={colors.primaryMuted}>
              {t('captain.backHome')}
            </T>
          </Pressable>
        </View>

        {/* إعادة التموضع: فوق اللوحة السفلية مباشرة حتى تبقى الخريطة واضحة والزر ظاهر */}
        <IconButton
          name="crosshairs-gps"
          color={followPaused ? colors.white : colors.primary}
          bg={followPaused ? colors.primary : colors.card}
          onPress={() => {
            setFollowPaused(false);
            if (pos) map.current?.flyTo(pos, 16);
          }}
          style={[styles.recenter, { bottom: sheetH + space.md }]}
        />

        <Sheet scroll style={{ maxHeight: '55%' }} onLayout={setSheetH}>
          {stale ? (
            <Row gap={6} style={{ justifyContent: 'center' }}>
              <Icon name="wifi-off" size={16} color={colors.warning} />
              <T v="small" color={colors.warning}>
                {t('offline.cached')}
              </T>
            </Row>
          ) : null}
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
          />
        </Sheet>

        {overlays}
      </View>
    );
  }

  // ───────── وجه استقبال الطلبات: خريطة بالخلف + الرصيد فوق + شريط التشغيل تحت ─────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <YMap
        ref={map}
        initialCenter={pos ?? KIRKUK_CENTER}
        initialZoom={pos ? 15 : 12.5}
        markers={markers}
        vehicle={pos}
        onMoveStart={() => setFollowPaused(true)}
      />

      {/* فوق: صورتك وتقييمك · الرصيد · قائمة الخيارات */}
      <View style={[styles.top, { top: insets.top + space.sm }]}>
        <Row style={{ alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <AccountCircle size={56} />
            {summary?.rating != null ? (
              <View style={styles.ratePill}>
                <Icon name="star" size={12} color={colors.warning} />
                <T v="small" color={colors.primaryDark} style={{ fontFamily: fonts.bold }}>
                  {summary.rating.toFixed(2)}
                </T>
              </View>
            ) : null}
          </View>

          <Pressable onPress={() => setBalanceOpen((v) => !v)} style={[styles.balanceCard, { flex: 1 }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="bodyBold" color={summary ? balanceColor(summary.balanceOwed) : colors.text}>
                {summary ? (summary.balanceOwed > 0 ? `-${iqd(summary.balanceOwed)}` : iqd(creditOf(summary.balanceOwed))) : '—'}
              </T>
              <Row gap={4}>
                <T v="small" color={colors.textSoft}>
                  {summary && summary.balanceOwed > 0 ? t('captain.debt.dueToCompany') : t('captain.debt.balanceNow')}
                </T>
                <Icon name={balanceOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </Row>
            </Row>
            {balanceOpen && summary ? (
              <>
                <DebtMeter
                  balance={summary.balanceOwed}
                  warnAt={summary.warnAt}
                  maxDebt={summary.effectiveMaxDebt ?? summary.maxDebt}
                  pendingReceipt={!!summary.pendingReceipt}
                  compact
                />
                <Pressable onPress={() => router.navigate('/(captain)/earnings')} hitSlop={6}>
                  <T v="small" center color={colors.primary} style={{ fontFamily: fonts.bold }}>
                    {t('captain.topUp')}
                  </T>
                </Pressable>
              </>
            ) : null}
          </Pressable>

          <IconButton name="menu" color={colors.primary} size={48} onPress={() => setMenuOpen(true)} />
        </Row>

        {/* الإشعارات: عدد الجديد + فتح الصندوق */}
        <Row style={{ justifyContent: 'flex-end', gap: space.sm }}>
          {unread ? (
            <Pressable onPress={() => router.push('/notifications')} style={styles.notifPill}>
              <T v="small" color={colors.text} numberOfLines={1}>
                {t('captain.unreadNotices', { count: unread })}
              </T>
            </Pressable>
          ) : null}
          <View>
            <IconButton name={unread ? 'email' : 'email-outline'} color={colors.primary} size={48} onPress={() => router.push('/notifications')} />
            {unread ? (
              <View style={styles.badge}>
                <T v="small" color={colors.white} style={{ fontSize: 11, lineHeight: 14 }}>
                  {unread > 9 ? '9+' : unread}
                </T>
              </View>
            ) : null}
          </View>
        </Row>

        {stale ? (
          <Row style={styles.notice}>
            <Icon name="wifi-off" color={colors.warning} />
            <T v="small" color={colors.textSoft} style={{ flex: 1 }}>
              {t('offline.cached')}
            </T>
          </Row>
        ) : null}
      </View>

      {/* رحلة شغالة: بانر يرجعه لتفاصيلها */}
      {ride ? (
        <Pressable onPress={() => setOnTrip(true)} style={[styles.tripBanner, styles.floatRow, { bottom: barH + space.md }]}>
          <Icon name="car-clock" color={colors.white} />
          <View style={{ flex: 1 }}>
            <T v="bodyBold" color={colors.white}>
              {t('home.activeRide')}
            </T>
            <T v="small" color={colors.primaryMuted}>
              {t(`status.${ride.status}`)}
            </T>
          </View>
          <T v="bodyBold" color={colors.white}>
            {t('home.open')}
          </T>
        </Pressable>
      ) : (
        <>
          {/* تنبيه: لازم يضغط الزر حتى تجيه طلبات */}
          {!online && !toggling ? (
            <View style={[styles.hint, { bottom: barH + space.md }]}>
              <T v="small" center color={colors.white}>
                {t('captain.pressToGoOnline')}
              </T>
            </View>
          ) : null}
          {/* إعادة التموضع */}
          <IconButton
            name="crosshairs-gps"
            color={followPaused ? colors.white : colors.primary}
            bg={followPaused ? colors.primary : colors.card}
            size={52}
            onPress={() => {
              setFollowPaused(false);
              if (pos) map.current?.flyTo(pos, 16);
            }}
            style={[styles.recenterStart, { bottom: barH + space.md }]}
          />
        </>
      )}

      {/* الشريط السفلي: مساعدة · تشغيل/إيقاف الاستقبال · المكافآت */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]} onLayout={(e) => setBarH(e.nativeEvent.layout.height)}>
        <BarItem icon="headset" label={t('captain.help')} onPress={() => openWhatsApp(cfg.captainSupportPhone ?? cfg.supportPhone, t('captain.helpText'))} />
        <Pressable
          disabled={!!ride || toggling || (!online && debtBlocked)}
          onPress={() => setOnlineState(!online)}
          style={[styles.toggle, { backgroundColor: online ? colors.primary : colors.border, opacity: ride ? 0.5 : 1 }]}
        >
          <View style={styles.toggleKnob}>
            <Icon name="power" size={20} color={online ? colors.primary : colors.muted} />
          </View>
          <T v="h3" color={online ? colors.white : colors.textSoft}>
            {online ? t('captain.open') : t('captain.closed')}
          </T>
        </Pressable>
        <BarItem icon="trophy-outline" label={t('captain.rewards.title')} onPress={() => router.push('/captain/rewards')} />
      </View>

      {/* الخيارات */}
      <BottomModal visible={menuOpen} onClose={() => setMenuOpen(false)} title={t('captain.options')}>
        <Row gap={space.sm}>
          <CaptainTile icon="history" label={t('more.myRides')} onPress={() => go('/captain/rides')} />
          <CaptainTile icon="account" label={t('account.title')} onPress={() => go('/(captain)/account')} />
          <CaptainTile icon="wallet-outline" label={t('captain.balance')} onPress={() => go('/(captain)/earnings')} />
        </Row>
        <Divider />
        <ListItem
          icon="account-group"
          title={t('khatti.title')}
          onPress={() => (cfg.khattiEnabled === false ? Alert.alert(t('common.comingSoon'), t('common.comingSoonBody')) : go('/khatti'))}
        />
        <ListItem icon="package-variant-closed" title={t('captain.requests')} onPress={() => Alert.alert(t('common.comingSoon'), t('common.comingSoonBody'))} />
        <ListItem icon="information-outline" title={t('about.title')} onPress={() => go('/about')} />
      </BottomModal>

      {overlays}
    </View>
  );
}

/** عنصر بالشريط السفلي (مساعدة / المكافآت) */
function BarItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.barItem} hitSlop={6}>
      <Icon name={icon} size={24} color={colors.primary} />
      <T v="small" color={colors.textSoft} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
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

  // رنة الطلب: ثلاث رنّات واهتزاز ثلاث مرات وبعدها تسكت (وتوقف فوراً بالقبول أو الرفض)
  useEffect(() => {
    // تشتغل حتى والجهاز على الصامت، وتخفض صوت التطبيقات الثانية بدل ما توقفها
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    const ring = createAudioPlayer(RING);
    ring.play();
    Vibration.vibrate([0, 600, 1400, 600, 1400, 600]);
    return () => {
      Vibration.cancel();
      ring.remove();
    };
  }, [offer.rideId]);
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ flex: 1 }}>
          <Icon
            name={offer.serviceType === 'delivery' ? 'package-variant-closed' : 'phone-in-talk'}
            color={offer.serviceType === 'delivery' ? colors.warning : colors.primary}
            size={26}
          />
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
        {/* كود خصم: الزبون يدفع أقل والشركة تعوّضك الفرق */}
        {offer.discount ? (
          <T v="small" color={colors.success}>
            {t('captain.offerDiscount', { amount: iqd(offer.discount) })}
          </T>
        ) : null}
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
        {/* يفتح المسار بتطبيق ملاحة (المستخدم يختار التطبيق كل مرة) */}
        <Pressable
          onPress={() => openNavApp(inTrip ? ride.dropoff : ride.pickup, inTrip ? t('nav.toDropoff') : t('nav.toPickup'))}
          style={styles.navPill}
          hitSlop={6}
        >
          <Icon name="navigation-variant" size={20} color={colors.white} />
          <T style={styles.navPillText}>{inTrip ? t('nav.toDropoff') : t('nav.toPickup')}</T>
        </Pressable>
        <SosButton onTrigger={onSos} />
      </Row>
      {tracking ? (
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

function CaptainTile({ icon, label, soon, onPress }: { icon: IconName; label: string; soon?: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.capTile, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={24} color={colors.primary} />
      <T v="small" numberOfLines={1} style={{ fontFamily: fonts.bold }}>
        {label}
      </T>
      {soon ? (
        <View style={styles.capSoon}>
          <T style={{ fontFamily: fonts.bold, fontSize: 9, color: colors.primaryDark, lineHeight: 14 }}>{t('common.comingSoon')}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capTile: {
    flex: 1,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  capSoon: { position: 'absolute', top: 6, end: 6, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 5 },
  top: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm },
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
  dot: { width: 10, height: 10, borderRadius: 5 },
  stats: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, ...shadow },
  recenter: { position: 'absolute', end: space.lg, zIndex: 2, ...shadow },
  tripBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...shadow,
  },
  tripBanner: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.primary, borderRadius: radius.md, padding: space.md },
  floatRow: { position: 'absolute', start: space.lg, end: space.lg, ...shadow },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  balanceCard: { gap: 6, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, ...shadow },
  notifPill: { flex: 1, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 8, ...shadow },
  hint: { position: 'absolute', start: space.lg, end: space.lg, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 10, ...shadow },
  recenterStart: { position: 'absolute', start: space.lg, zIndex: 2, ...shadow },
  bar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barItem: { alignItems: 'center', gap: 2, width: 76 },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 54,
    borderRadius: radius.pill,
  },
  toggleKnob: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  notice: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  onlineCard: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
    shadowOpacity: 0.06,
  },
  warn: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md },
  timer: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 4 },
  fareBig: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.md },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginEnd: space.sm },
  navPillText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12, lineHeight: 18 },
  deliveryBox: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.md },
  pkg: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
});
