import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PriceText } from '../components/common';
import { DocPicker, type DocValue } from '../components/DocPicker';
import { Button, Chip, Icon, Input, Pill, Row, Sheet, T, type IconName } from '../components/ui';
import { CenterPin, YMap, type MapMarker, type YMapHandle } from '../components/YMap';
import { KIRKUK_CENTER } from '../config';
import { localName } from '../i18n';
import { api, ApiError, apiWithRetry } from '../lib/api';
import { errorText, WEAK_GPS_METERS } from '../lib/device';
import { getFix, requestLocation, useMyLocation } from '../lib/location';
import { iqd, km, minutes, shortAddress } from '../lib/format';
import { haversineKm, inArea } from '../lib/geo';
import type { Point, Quote, ReverseInfo, Ride, SavedPlace } from '../lib/types';
import { useAppConfig } from '../state/appConfig';
import { useAuth } from '../state/auth';
import { placeBus, takePendingBooking } from '../state/placeBus';
import { colors, fonts, radius, shadow, space } from '../theme';

type Step = 'pickup' | 'dropoff' | 'stop' | 'details';
type PinStep = Exclude<Step, 'details'>;

/**
 * طلب تكسي:
 *   1) نقطة الانطلاق (دبوس ثابت بنص الخريطة + استخدم موقعي + بحث + كتابة العنوان)
 *   2) الوجهة (بحث، خريطة، أو مكان محفوظ)
 *   3) تفاصيل الرحلة: المسار الحقيقي، المسافة، الوقت، السعر لكل فئة، محطة إضافية،
 *      ذهاب وإياب، كود الخصم، الدفع نقداً ← اطلب الآن
 */
export default function BookScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ step?: string; service?: string }>();
  // قسم الطلبات (توصيل داخل كركوك) يستخدم نفس الشاشة: نقطة استلام ← نقطة تسليم ← تفاصيل الطلب
  const isDelivery = params.service === 'delivery';
  const { me } = useAuth();
  const merchant = me?.merchant ?? null;
  const pending = useMemo(() => takePendingBooking(), []);
  const map = useRef<YMapHandle>(null);

  const [pickup, setPickup] = useState<Point | undefined>(pending?.pickup);
  const [dropoff, setDropoff] = useState<Point | undefined>(pending?.dropoff);
  const [stop, setStop] = useState<Point | null>(pending?.stops?.[0] ?? null);
  const [roundTrip, setRoundTrip] = useState(false);
  const [step, setStep] = useState<Step>(() =>
    pending?.pickup && pending?.dropoff ? 'details' : params.step === 'dropoff' && pending?.pickup ? 'dropoff' : 'pickup',
  );

  // وضع الدبوس
  // موقعي الحي: فوري (آخر موقع معروف) ويتدقق كل ثانيتين من GPS
  const { fix: gps } = useMyLocation();
  // الدبوس يتبع موقعي لحد ما المستخدم يحرك الخريطة بنفسه
  const follow = useRef(true);
  const followedAt = useRef<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [centerInfo, setCenterInfo] = useState<ReverseInfo | null>(null);
  const centerAddress = centerInfo?.address ?? null;
  const [resolving, setResolving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [note, setNote] = useState('');
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const labelFor = useRef<{ lat: number; lng: number; label: string } | null>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // تفاصيل الرحلة
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('taxi');
  const [promo, setPromo] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const requestId = useRef<string>(Crypto.randomUUID());

  // تفاصيل التوصيل
  const [itemType, setItemType] = useState<string | null>(null);
  const [photo, setPhoto] = useState<DocValue | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [asMerchant, setAsMerchant] = useState(false);

  useEffect(() => {
    api<SavedPlace[]>('/api/me/places').then(setPlaces).catch(() => {});
    // عنده نقطة انطلاق من قبل (رجع من الوجهة مثلاً): ما نحرك الخريطة عليه
    if (pickup || step !== 'pickup') follow.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // نقطة الانطلاق = موقعي: أول ما يوصل الموقع، وكل ما تجي قراءة أدق بشكل واضح
  useEffect(() => {
    if (!gps || !follow.current || step !== 'pickup') return;
    const prev = followedAt.current;
    const better =
      !prev ||
      (gps.accuracy != null && prev.accuracy != null && gps.accuracy + 15 < prev.accuracy && haversineKm(prev, gps) > 0.015);
    if (!better) return;
    followedAt.current = { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy };
    labelFor.current = null;
    map.current?.flyTo(gps, 17);
  }, [gps, step]);

  const useMyPosition = async () => {
    const f = getFix();
    if (f) {
      follow.current = step === 'pickup';
      followedAt.current = { lat: f.lat, lng: f.lng, accuracy: f.accuracy };
      flyToPlace({ ...f, address: null });
      return;
    }
    follow.current = true;
    followedAt.current = null;
    await requestLocation();
  };

  // ───── وضع الدبوس ─────

  const pointForStep = (s: PinStep) => (s === 'pickup' ? pickup : s === 'dropoff' ? dropoff : stop ?? undefined);

  const goToStep = (s: Step) => {
    // بعد ما ثبت نقطة الانطلاق، الدبوس ما يتبع الموقع بعد
    follow.current = false;
    setStep(s);
    setNote('');
    if (s !== 'details') {
      const existing = pointForStep(s);
      const target = existing ?? (s === 'pickup' ? gps : null) ?? pickup ?? gps;
      if (existing?.address) labelFor.current = { lat: existing.lat, lng: existing.lng, label: existing.address };
      setTimeout(() => target && map.current?.flyTo(target, 17), 50);
    }
  };

  const onCenterChanged = useCallback((c: { lat: number; lng: number }) => {
    setCenter(c);
    setMoving(false);
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    const known = labelFor.current;
    if (known && haversineKm(known, c) < 0.03 && known.label) {
      setCenterInfo({ address: known.label, area: null, street: null, landmark: null });
      setResolving(false);
      // نجيب اسم المنطقة بالخلفية حتى يطلع فوق الدبوس
      api<ReverseInfo>('/api/geo/reverse', { query: { lat: c.lat, lng: c.lng } })
        .then((r) => setCenterInfo({ ...r, address: known.label }))
        .catch(() => {});
      return;
    }
    labelFor.current = null;
    setResolving(true);
    reverseTimer.current = setTimeout(() => {
      api<ReverseInfo>('/api/geo/reverse', { query: { lat: c.lat, lng: c.lng } })
        .then(setCenterInfo)
        .catch(() => setCenterInfo(null))
        .finally(() => setResolving(false));
    }, 450);
  }, []);

  // نتيجة شاشة البحث
  useEffect(
    () =>
      placeBus.on((target, place) => {
        if (target !== 'book') return;
        labelFor.current = { lat: place.lat, lng: place.lng, label: place.address ?? '' };
        map.current?.flyTo(place, 17);
      }),
    [],
  );

  const flyToPlace = (p: { lat: number; lng: number; address?: string | null; label?: string }) => {
    labelFor.current = { lat: p.lat, lng: p.lng, label: p.address || p.label || '' };
    map.current?.flyTo(p, 17);
  };

  const confirmPin = () => {
    if (!center) return;
    if (!inArea(center, cfg.serviceArea)) {
      Alert.alert('', t('errors.outside_service_area'));
      return;
    }
    const address = [centerAddress, note.trim()].filter(Boolean).join(' – ') || null;
    const p: Point = { lat: center.lat, lng: center.lng, address };
    if (step === 'pickup') {
      setPickup(p);
      goToStep(dropoff ? 'details' : 'dropoff');
    } else if (step === 'dropoff') {
      setDropoff(p);
      goToStep('details');
    } else if (step === 'stop') {
      setStop(p);
      goToStep('details');
    }
  };

  // ───── عرض السعر ─────

  const fetchQuote = useCallback(async () => {
    if (!pickup || !dropoff) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      const q = await api<Quote>('/api/rides/quote', {
        body: isDelivery
          ? { pickup, dropoff, stops: [], roundTrip: false, promoCode: promo, serviceType: 'delivery' }
          : { pickup, dropoff, stops: stop ? [stop] : [], roundTrip, promoCode: promo },
      });
      setQuote(q);
      requestId.current = Crypto.randomUUID();
      setCategory((c) => (q.options.some((o) => o.category === c) ? c : (q.options.find((o) => o.available) ?? q.options[0])?.category ?? 'taxi'));
      return q;
    } catch (err) {
      setQuote(null);
      setQuoteError(errorText(err));
    } finally {
      setQuoting(false);
    }
  }, [pickup, dropoff, stop, roundTrip, promo, isDelivery]);

  useEffect(() => {
    if (step === 'details') fetchQuote();
  }, [step, fetchQuote]);

  useEffect(() => {
    if (step !== 'details' || !quote) return;
    const pts = [pickup, stop, dropoff].filter(Boolean) as Point[];
    setTimeout(() => map.current?.fitTo(pts, { top: insets.top + 80, bottom: 520, left: 60, right: 60 }), 100);
  }, [quote, step, pickup, stop, dropoff, insets.top]);

  const option = quote?.options.find((o) => o.category === category);
  const promoErr = promo && option?.promoError ? t(`errors.${option.promoError}`) : null;

  const order = async () => {
    if (!quote || !option) return;
    setOrdering(true);
    try {
      // نفس المفتاح لنفس الطلب: إذا النت انقطع وعدنا المحاولة ما ينشأ طلبين
      const ride = await apiWithRetry<Ride>('/api/rides', {
        body: {
          quoteId: quote.quoteId,
          category,
          paymentMethod: 'cash',
          ...(isDelivery
            ? {
                delivery: {
                  itemType,
                  photoId: photo?.id,
                  recipientName: recipientName.trim() || null,
                  recipientPhone: recipientPhone.trim() || null,
                  note: orderNote.trim() || null,
                  asMerchant: asMerchant && merchant?.status === 'approved',
                },
              }
            : {}),
        },
        headers: { 'Idempotency-Key': requestId.current },
      });
      router.replace(`/ride/${ride.id}`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'quote_expired' || code.startsWith('promo_')) {
        if (code.startsWith('promo_')) setPromo(null);
        await fetchQuote();
        Alert.alert('', t('book.priceChanged'));
      } else if (code === 'active_ride_exists') {
        const a = await api<Ride | null>('/api/rides/active').catch(() => null);
        if (a) router.replace(`/ride/${a.id}`);
      } else {
        Alert.alert('', errorText(err));
      }
    } finally {
      setOrdering(false);
    }
  };

  // ───── الخريطة ─────

  const markers: MapMarker[] = [];
  if (gps) markers.push({ id: 'me', kind: 'me', lat: gps.lat, lng: gps.lng });
  if (step === 'details') {
    if (pickup) markers.push({ id: 'pickup', kind: 'pickup', ...pickup });
    if (stop) markers.push({ id: 'stop', kind: 'stop', ...stop });
    if (dropoff) markers.push({ id: 'dropoff', kind: 'dropoff', ...dropoff });
  } else if (step !== 'pickup' && pickup) {
    markers.push({ id: 'pickup', kind: 'pickup', ...pickup });
  }

  const initial = (step === 'pickup' ? pickup : step === 'dropoff' ? dropoff : undefined) ?? pickup ?? (step === 'pickup' ? getFix() : null) ?? KIRKUK_CENTER;
  const pinTitle =
    step === 'pickup'
      ? t(isDelivery ? 'delivery.pickupTitle' : 'book.pickupTitle')
      : step === 'dropoff'
        ? t(isDelivery ? 'delivery.dropoffTitle' : 'book.dropoffTitle')
        : t('book.stopTitle');
  const deliveryReady = !isDelivery || (!!itemType && !!photo);
  const confirmTitle = step === 'pickup' ? t('book.confirmPickup') : step === 'dropoff' ? t('book.confirmDropoff') : t('book.confirmStop');
  const weakGps = step === 'pickup' && gps?.accuracy != null && gps.accuracy > WEAK_GPS_METERS;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <YMap
        ref={map}
        initialCenter={initial}
        initialZoom={16}
        markers={markers}
        route={step === 'details' ? quote?.routeGeometry : null}
        onCenterChanged={onCenterChanged}
        onMoveStart={() => {
          follow.current = false;
          setMoving(true);
        }}
      />

      {step !== 'details' ? (
        <>
          <CenterPin kind={step} lifted={moving} label={!moving && !resolving ? (centerInfo?.area ?? centerInfo?.street ?? null) : null} />

          {/* الأعلى: رجوع + العنوان + البحث */}
          <View style={[styles.topBar, { top: insets.top + space.sm }]}>
            <Row>
              <Pressable onPress={() => (step === 'pickup' ? router.back() : goToStep(step === 'dropoff' ? 'pickup' : 'details'))} hitSlop={10} style={styles.round}>
                <Icon name="arrow-left" flip />
              </Pressable>
              <T v="h3" style={{ flex: 1 }}>
                {pinTitle}
              </T>
            </Row>
            <Pressable onPress={() => router.push({ pathname: '/search', params: { target: 'book' } })} style={styles.searchBox}>
              <Icon name="magnify" color={colors.primary} />
              <T v="body" color={colors.muted}>
                {t('book.searchPlace')}
              </T>
            </Pressable>
          </View>

          <Sheet>
            <PlaceInfo info={centerInfo} busy={resolving || moving} center={center} label={step === 'pickup' ? t('book.pickupHere') : step === 'dropoff' ? t('book.dropoffHere') : t('book.selectedPlace')} />
            {step === 'pickup' ? (
              <Input placeholder={t('book.addressDetailsPlaceholder')} value={note} onChangeText={setNote} maxLength={80} />
            ) : null}
            {places.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {places.map((p) => (
                  <Chip
                    key={p.id}
                    icon={p.kind === 'home' ? 'home-variant' : p.kind === 'work' ? 'briefcase-variant' : 'star'}
                    label={p.label}
                    onPress={() => flyToPlace({ ...p, address: p.address ?? p.label })}
                  />
                ))}
              </ScrollView>
            ) : null}
            {weakGps ? (
              <Row style={styles.warn}>
                <Icon name="information-outline" color={colors.warning} size={18} />
                <T v="small" color={colors.warning} style={{ flex: 1 }}>
                  {t('book.gpsWeak')}
                </T>
              </Row>
            ) : null}
            <Row>
              <Button kind="secondary" icon="crosshairs-gps" title={t('book.useMyLocation')} small style={{ minHeight: 54 }} onPress={useMyPosition} />
              <Button title={confirmTitle} onPress={confirmPin} disabled={!center || moving} style={{ flex: 1 }} />
            </Row>
          </Sheet>
        </>
      ) : (
        <>
          <View style={[styles.topBar, { top: insets.top + space.sm, padding: space.sm }]}>
            <Row>
              <Pressable onPress={() => goToStep('dropoff')} hitSlop={10} style={styles.round}>
                <Icon name="arrow-left" flip />
              </Pressable>
              <T v="h3" style={{ flex: 1 }}>
                {isDelivery ? t('delivery.details') : t('book.tripDetails')}
              </T>
              {quote?.period === 'night' ? <Pill label={t('book.nightPricing')} /> : null}
            </Row>
          </View>

          <Sheet scroll style={{ maxHeight: '66%' }}>
            {/* النقاط: A ← (B) ← الوجهة */}
            <View style={styles.points}>
              <PointRow
                icon="alpha-a-circle"
                label={isDelivery ? t('delivery.pickupLabel') : t('book.from')}
                value={shortAddress(pickup)}
                onPress={() => goToStep('pickup')}
              />
              {stop ? (
                <PointRow
                  icon="alpha-b-circle"
                  label={t('book.stop')}
                  value={shortAddress(stop)}
                  onPress={() => goToStep('stop')}
                  onRemove={() => setStop(null)}
                />
              ) : null}
              <PointRow
                icon="map-marker"
                label={isDelivery ? t('delivery.dropoffLabel') : t('book.to')}
                value={shortAddress(dropoff)}
                onPress={() => goToStep('dropoff')}
              />
              {!stop && !isDelivery ? (
                <Pressable onPress={() => goToStep('stop')} style={styles.addStop}>
                  <Icon name="plus" color={colors.primary} size={20} />
                  <T v="bodyBold" color={colors.primary}>
                    {t('book.addStop')}
                  </T>
                </Pressable>
              ) : null}
            </View>

            {!isDelivery ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="bodyBold">{t('book.roundTrip')}</T>
                <Switch value={roundTrip} onValueChange={setRoundTrip} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} />
              </Row>
            ) : null}

            {quoting && !quote ? (
              <Row style={{ justifyContent: 'center', padding: space.lg }}>
                <ActivityIndicator color={colors.primary} />
                <T v="caption">{t('book.calculating')}</T>
              </Row>
            ) : quoteError ? (
              <View style={{ gap: space.sm }}>
                <T v="caption" color={colors.danger} center>
                  {quoteError}
                </T>
                <Button kind="secondary" title={t('common.retry')} onPress={fetchQuote} />
              </View>
            ) : quote ? (
              <>
                {!isDelivery ? <T v="small">{t('book.chooseCategory')}</T> : null}
                <Row gap={space.sm}>
                  {quote.options.map((o) => {
                    const sel = o.category === category;
                    return (
                      <Pressable key={o.category} onPress={() => setCategory(o.category)} style={[styles.cat, sel && styles.catSel]}>
                        <Icon
                          name={isDelivery ? 'package-variant-closed' : o.category === 'private' ? 'car-side' : 'taxi'}
                          size={28}
                          color={sel ? colors.white : colors.primary}
                        />
                        <T v="bodyBold" color={sel ? colors.white : colors.text}>
                          {localName(o.name)}
                        </T>
                        <T v="small" color={sel ? colors.primaryMuted : colors.muted}>
                          {o.available && o.driverEtaMin ? t('book.arrivesIn', { min: o.driverEtaMin }) : t('book.unavailable')}
                        </T>
                        {o.discount > 0 ? (
                          <T v="small" color={sel ? colors.primaryMuted : colors.muted} style={{ textDecorationLine: 'line-through' }}>
                            {iqd(o.fareBeforeDiscount)}
                          </T>
                        ) : null}
                        <T style={{ fontFamily: fonts.heavy, fontSize: 16 }} color={sel ? colors.white : colors.primaryDark}>
                          {iqd(o.finalFare)}
                        </T>
                      </Pressable>
                    );
                  })}
                </Row>

                <Row style={styles.summary}>
                  <Summary label={t('book.distance')} value={km(quote.distanceKm)} />
                  <View style={styles.vline} />
                  <Summary label={t('book.time')} value={minutes(quote.durationMin)} />
                  <View style={styles.vline} />
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <T v="small">{t('book.price')}</T>
                    {option ? <PriceText final={option.finalFare} before={option.discount ? option.fareBeforeDiscount : undefined} /> : null}
                  </View>
                </Row>

                {quote.penaltyPercent > 0 ? (
                  <Row style={styles.warn}>
                    <Icon name="information-outline" color={colors.warning} size={18} />
                    <T v="small" color={colors.warning} style={{ flex: 1 }}>
                      {t('book.penaltyNote', { pct: quote.penaltyPercent })}
                    </T>
                  </Row>
                ) : null}

                {/* كود الخصم */}
                {promo && !promoErr ? (
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={6}>
                      <Icon name="ticket-percent" color={colors.success} />
                      <T v="bodyBold" color={colors.success}>
                        {t('book.promoApplied', { code: promo })}
                      </T>
                    </Row>
                    <Pressable onPress={() => setPromo(null)}>
                      <T v="caption" color={colors.danger}>
                        {t('book.remove')}
                      </T>
                    </Pressable>
                  </Row>
                ) : promoOpen || promoErr ? (
                  <View style={{ gap: 6 }}>
                    <Row>
                      <Input
                        containerStyle={{ flex: 1 }}
                        placeholder={t('book.promoPlaceholder')}
                        value={promoInput}
                        onChangeText={(v) => setPromoInput(v.toUpperCase())}
                        autoCapitalize="characters"
                        style={{ textAlign: 'left' }}
                      />
                      <Button small style={{ minHeight: 52 }} title={t('book.apply')} disabled={!promoInput.trim()} onPress={() => setPromo(promoInput.trim())} />
                    </Row>
                    {promoErr ? (
                      <T v="small" color={colors.danger}>
                        {promoErr}
                      </T>
                    ) : null}
                  </View>
                ) : (
                  <Pressable onPress={() => setPromoOpen(true)}>
                    <Row gap={6}>
                      <Icon name="ticket-percent" color={colors.primary} />
                      <T v="bodyBold" color={colors.primary}>
                        {t('book.promoQuestion')}
                      </T>
                    </Row>
                  </Pressable>
                )}

                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="caption">{t('book.payment')}</T>
                  <Row gap={6}>
                    <Icon name="cash" color={colors.success} />
                    <T v="bodyBold">{t('book.cash')}</T>
                  </Row>
                </Row>

                {isDelivery ? (
                  <DeliveryDetails
                    itemTypes={cfg.lists.deliveryItemTypes ?? ['documents', 'food', 'clothes', 'electronics', 'home', 'medicine', 'other']}
                    itemType={itemType}
                    setItemType={setItemType}
                    photo={photo}
                    setPhoto={setPhoto}
                    recipientName={recipientName}
                    setRecipientName={setRecipientName}
                    recipientPhone={recipientPhone}
                    setRecipientPhone={setRecipientPhone}
                    note={orderNote}
                    setNote={setOrderNote}
                    merchant={merchant}
                    asMerchant={asMerchant}
                    setAsMerchant={(v) => {
                      setAsMerchant(v);
                      // التاجر: نقطة الاستلام = محله
                      if (v && merchant) setPickup({ ...merchant.location, address: merchant.location.address ?? merchant.storeName });
                    }}
                  />
                ) : null}

                {isDelivery && !deliveryReady ? (
                  <T v="small" color={colors.warning} center>
                    {!itemType ? t('delivery.needType') : t('delivery.needPhoto')}
                  </T>
                ) : null}
                <Button
                  title={isDelivery ? t('delivery.orderNow') : t('book.orderNow')}
                  onPress={order}
                  loading={ordering || quoting}
                  disabled={!option || !deliveryReady}
                />
              </>
            ) : null}
          </Sheet>
        </>
      )}
    </View>
  );
}

/** المكان تحت الدبوس: المنطقة بخط كبير، والشارع وأقرب معلم تحتها */
function PlaceInfo({ info, busy, center, label }: { info: ReverseInfo | null; busy: boolean; center: { lat: number; lng: number } | null; label: string }) {
  const { t } = useTranslation();
  const title = info?.area ?? info?.address ?? info?.street ?? info?.landmark ?? null;
  const sub = [info?.area && info?.street ? info.street : null, info?.landmark && info.landmark !== title ? t('book.near', { place: info.landmark }) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={styles.placeIcon}>
        <Icon name="map-marker-radius" color={colors.primary} size={24} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="small">{label}</T>
        {busy ? (
          <Row gap={6}>
            <ActivityIndicator size="small" color={colors.primary} />
            <T v="caption">{t('book.locating')}</T>
          </Row>
        ) : (
          <>
            <T v="h3" numberOfLines={1}>
              {title ?? (center ? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` : '…')}
            </T>
            {sub ? (
              <T v="caption" numberOfLines={2}>
                {sub}
              </T>
            ) : null}
          </>
        )}
      </View>
    </Row>
  );
}

/** قسم الطلبات: نوع الطلب + صورة الطلب (إلزامية لإخلاء مسؤولية الكابتن) + المستلم + التاجر */
function DeliveryDetails(p: {
  itemTypes: string[];
  itemType: string | null;
  setItemType: (v: string) => void;
  photo: DocValue | null;
  setPhoto: (v: DocValue | null) => void;
  recipientName: string;
  setRecipientName: (v: string) => void;
  recipientPhone: string;
  setRecipientPhone: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  merchant: { status: string; storeName: string } | null;
  asMerchant: boolean;
  setAsMerchant: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 6 }}>
        <T v="bodyBold">{t('delivery.itemType')}</T>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {p.itemTypes.map((k) => (
            <Chip key={k} label={t(`itemTypes.${k}`)} selected={p.itemType === k} onPress={() => p.setItemType(k)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: 6 }}>
        <T v="bodyBold">{t('delivery.photo')}</T>
        <DocPicker kind="package" label={t('delivery.photoLabel')} value={p.photo} onChange={p.setPhoto} icon="package-variant" height={140} />
        <T v="small">{t('delivery.photoHint')}</T>
      </View>

      <Row>
        <Input containerStyle={{ flex: 1 }} label={t('delivery.recipientName')} value={p.recipientName} onChangeText={p.setRecipientName} maxLength={60} />
        <Input
          containerStyle={{ flex: 1 }}
          label={t('delivery.recipientPhone')}
          value={p.recipientPhone}
          onChangeText={p.setRecipientPhone}
          keyboardType="phone-pad"
          placeholder="07XX XXX XXXX"
          maxLength={14}
          style={{ textAlign: 'left' }}
        />
      </Row>
      <Input label={t('delivery.note')} placeholder={t('delivery.notePlaceholder')} value={p.note} onChangeText={p.setNote} maxLength={200} />

      {p.merchant?.status === 'approved' ? (
        <Row style={styles.merchantRow}>
          <Icon name="storefront-outline" color={colors.primary} />
          <View style={{ flex: 1 }}>
            <T v="bodyBold">{t('delivery.asMerchant', { store: p.merchant.storeName })}</T>
            <T v="small">{t('delivery.asMerchantHint')}</T>
          </View>
          <Switch value={p.asMerchant} onValueChange={p.setAsMerchant} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} />
        </Row>
      ) : p.merchant?.status === 'pending' ? (
        <Row style={styles.merchantRow}>
          <Icon name="timer-sand" color={colors.warning} />
          <T v="small" style={{ flex: 1 }}>
            {t('merchant.pendingShort')}
          </T>
        </Row>
      ) : (
        <Pressable onPress={() => router.push('/merchant')} style={styles.merchantRow}>
          <Icon name="storefront-outline" color={colors.primary} />
          <T v="bodyBold" color={colors.primary} style={{ flex: 1 }}>
            {t('merchant.cta')}
          </T>
          <Icon name="chevron-right" flip color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

function PointRow({ icon, label, value, onPress, onRemove }: { icon: IconName; label: string; value: string; onPress: () => void; onRemove?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 }}>
      <Icon name={icon} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <T v="small">{label}</T>
        <T v="bodyBold" numberOfLines={1}>
          {value}
        </T>
      </View>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10}>
          <Icon name="close-circle" color={colors.muted} />
        </Pressable>
      ) : (
        <Icon name="pencil" size={16} color={colors.muted} />
      )}
    </Pressable>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <T v="small">{label}</T>
      <T v="bodyBold">{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    ...shadow,
  },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    minHeight: 46,
  },
  warn: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.sm },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md },
  placeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  points: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.xs },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8 },
  cat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  catSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  summary: { backgroundColor: colors.bg, borderRadius: radius.md, paddingVertical: space.md },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
});
