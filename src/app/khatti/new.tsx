import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { DocPicker, type DocValue } from '../../components/DocPicker';
import { Button, Card, Chip, Header, Icon, Input, Row, Screen, T } from '../../components/ui';
import { IS_CAPTAIN } from '../../config';
import { showError } from '../../lib/device';
import { iqd, ltr } from '../../lib/format';
import { createPost, PASSENGER_TYPES } from '../../lib/khatti';
import { getFix } from '../../lib/location';
import type { PassengerType, Point } from '../../lib/types';
import { placeBus } from '../../state/placeBus';
import { colors, radius, space } from '../../theme';

/**
 * نشر خط: الكابتن ينشر عرض مقاعد، والزبون ينشر طلب خط.
 * كل الحقول إلزامية (نوع الركاب، المسار، الوقت، المقاعد، السعر)، وداخل كركوك بس.
 * ممنوع كتابة أرقام أو روابط بالملاحظة (السيرفر يرفضها).
 */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function KhattiNew() {
  const { t } = useTranslation();
  const kind = IS_CAPTAIN ? 'offer' : 'request';
  const [type, setType] = useState<PassengerType>('mixed');
  const [from, setFrom] = useState<Point | null>(null);
  const [to, setTo] = useState<Point | null>(null);
  const [fromLabel, setFromLabel] = useState('');
  const [toLabel, setToLabel] = useState('');
  const [day, setDay] = useState<0 | 1>(0);
  const [hour, setHour] = useState(() => Math.min(23, new Date().getHours() + 1));
  const [minute, setMinute] = useState<0 | 30>(0);
  const [seats, setSeats] = useState(IS_CAPTAIN ? 3 : 1);
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<'per_seat' | 'per_trip'>('per_seat');
  const [note, setNote] = useState('');
  const [selfie, setSelfie] = useState<DocValue | null>(null);
  const [carPhoto, setCarPhoto] = useState<DocValue | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      placeBus.on((target, place) => {
        const label = place.address?.trim() || '';
        if (target === 'khatti-from') {
          setFrom(place);
          setFromLabel((l) => l || label);
        } else if (target === 'khatti-to') {
          setTo(place);
          setToLabel((l) => l || label);
        }
      }),
    [],
  );

  const pick = (target: 'khatti-from' | 'khatti-to') => {
    const here = getFix();
    router.push({
      pathname: '/pick-location',
      params: { target, title: t(target === 'khatti-from' ? 'khatti.from' : 'khatti.to'), ...(here ? { lat: String(here.lat), lng: String(here.lng) } : {}) },
    });
  };

  const submit = async () => {
    const p = Number(price);
    if (!from || !to || !fromLabel.trim() || !toLabel.trim()) {
      Alert.alert('', t('khatti.needRoute'));
      return;
    }
    if (!Number.isFinite(p) || p < 250) {
      Alert.alert('', t('khatti.needPrice'));
      return;
    }
    const when = new Date();
    when.setDate(when.getDate() + day);
    when.setHours(hour, minute, 0, 0);
    if (when.getTime() < Date.now()) when.setDate(when.getDate() + 1);

    setBusy(true);
    try {
      await createPost({
        kind,
        passengerType: type,
        from: { lat: from.lat, lng: from.lng, label: fromLabel.trim() },
        to: { lat: to.lat, lng: to.lng, label: toLabel.trim() },
        departAt: when.toISOString(),
        seats,
        price: Math.round(p),
        priceUnit: unit,
        note: note.trim() || null,
        captainPhotoId: selfie?.id ?? null,
        carPhotoId: carPhoto?.id ?? null,
      });
      Alert.alert('', t('khatti.published'));
      router.back();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={IS_CAPTAIN ? t('khatti.newOffer') : t('khatti.newRequest')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        <T v="caption">{t('khatti.newHint')}</T>

        <View style={{ gap: space.sm }}>
          <T v="h3">{t('khatti.passengerType')}</T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {PASSENGER_TYPES.map((p) => (
              <Chip key={p} label={t(`khatti.types.${p}`)} selected={type === p} onPress={() => setType(p)} />
            ))}
          </Row>
        </View>

        <View style={{ gap: space.sm }}>
          <T v="h3">{t('khatti.route')}</T>
          <Pressable onPress={() => pick('khatti-from')} style={styles.picker}>
            <Icon name="map-marker-outline" color={colors.primary} />
            <T v="body" style={{ flex: 1 }} numberOfLines={1}>
              {from ? `${from.lat.toFixed(4)}, ${from.lng.toFixed(4)}` : t('khatti.pickFrom')}
            </T>
            <Icon name="chevron-right" flip color={colors.muted} />
          </Pressable>
          <Input label={t('khatti.fromName')} value={fromLabel} onChangeText={setFromLabel} maxLength={60} />
          <Pressable onPress={() => pick('khatti-to')} style={styles.picker}>
            <Icon name="flag-outline" color={colors.primary} />
            <T v="body" style={{ flex: 1 }} numberOfLines={1}>
              {to ? `${to.lat.toFixed(4)}, ${to.lng.toFixed(4)}` : t('khatti.pickTo')}
            </T>
            <Icon name="chevron-right" flip color={colors.muted} />
          </Pressable>
          <Input label={t('khatti.toName')} value={toLabel} onChangeText={setToLabel} maxLength={60} />
        </View>

        <View style={{ gap: space.sm }}>
          <T v="h3">{t('khatti.time')}</T>
          <Row gap={space.sm}>
            <Chip label={t('khatti.today')} selected={day === 0} onPress={() => setDay(0)} />
            <Chip label={t('khatti.tomorrow')} selected={day === 1} onPress={() => setDay(1)} />
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
            {HOURS.map((h) => (
              <Chip key={h} label={ltr(`${String(h).padStart(2, '0')}:00`)} selected={hour === h} onPress={() => setHour(h)} />
            ))}
          </ScrollView>
          <Row gap={space.sm}>
            <Chip label={ltr(':00')} selected={minute === 0} onPress={() => setMinute(0)} />
            <Chip label={ltr(':30')} selected={minute === 30} onPress={() => setMinute(30)} />
          </Row>
        </View>

        <View style={{ gap: space.sm }}>
          <T v="h3">{t('khatti.seats')}</T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {(IS_CAPTAIN ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4]).map((n) => (
              <Chip key={n} label={String(n)} selected={seats === n} onPress={() => setSeats(n)} />
            ))}
          </Row>
        </View>

        <View style={{ gap: space.sm }}>
          <T v="h3">{t('khatti.price')}</T>
          <Input
            value={price}
            onChangeText={(v) => setPrice(v.replace(/[^\d]/g, ''))}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            placeholder="2000"
            maxLength={7}
          />
          <Row gap={space.sm}>
            <Chip label={t('khatti.unit.per_seat')} selected={unit === 'per_seat'} onPress={() => setUnit('per_seat')} />
            <Chip label={t('khatti.unit.per_trip')} selected={unit === 'per_trip'} onPress={() => setUnit('per_trip')} />
          </Row>
          {price ? <T v="small">{iqd(Number(price))}</T> : null}
        </View>

        {IS_CAPTAIN ? (
          <View style={{ gap: space.sm }}>
            <T v="h3">{t('khatti.photos')}</T>
            <T v="caption">{t('khatti.photosHint')}</T>
            <Row gap={space.sm}>
              <DocPicker kind="selfie" label={t('khatti.selfie')} value={selfie} onChange={setSelfie} icon="account" style={{ flex: 1 }} />
              <DocPicker kind="car_photo" label={t('khatti.carPhoto')} value={carPhoto} onChange={setCarPhoto} icon="car" style={{ flex: 1 }} />
            </Row>
          </View>
        ) : null}

        <Input label={t('khatti.note')} value={note} onChangeText={setNote} maxLength={200} multiline style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
        <Card style={{ padding: space.md, backgroundColor: colors.warningSoft }}>
          <T v="small" color={colors.warning}>
            {t('khatti.rulesShort')}
          </T>
        </Card>

        <Button title={t('khatti.publish')} loading={busy} onPress={submit} />
      </ScrollView>
    </Screen>
  );
}

const styles = {
  picker: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: space.md,
  },
};
