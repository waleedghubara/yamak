import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { Button, Card, Divider, Empty, Header, Icon, IconButton, Pill, Row, Screen, T } from '../../components/ui';
import { callPhone, openWhatsApp, showError } from '../../lib/device';
import { freshFix, getFix } from '../../lib/location';
import { iqd, ltr } from '../../lib/format';
import { acceptBooking, cancelBooking, confirmBooking, declineBooking, myBookings } from '../../lib/khatti';
import type { KhattiBooking } from '../../lib/types';
import { colors, space } from '../../theme';

/**
 * طلبات خطي: صاحب الإعلان يقبل/يرفض، والطرف الثاني يؤكد.
 * رقم الهاتف يظهر **بعد التأكيد من الطرفين** فقط (ماكو دردشة داخل التطبيق).
 */
export default function KhattiBookings() {
  const { t } = useTranslation();
  const [items, setItems] = useState<KhattiBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    myBookings()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      load();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  };

  const live = items.filter((b) => ['pending', 'accepted', 'confirmed'].includes(b.status));
  const past = items.filter((b) => !['pending', 'accepted', 'confirmed'].includes(b.status));

  return (
    <Screen>
      <Header title={t('khatti.bookings')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/khatti'))} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      >
        {!items.length && !loading ? <Empty icon="account-clock-outline" text={t('khatti.noBookings')} /> : null}

        {live.map((b) => (
          <BookingCard key={b.id} b={b} busy={busy === b.id} onRun={(fn) => run(b.id, fn)} />
        ))}

        {past.length ? (
          <>
            <T v="h3">{t('khatti.pastBookings')}</T>
            {past.map((b) => (
              <BookingCard key={b.id} b={b} busy={false} onRun={() => {}} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function BookingCard({ b, busy, onRun }: { b: KhattiBooking; busy: boolean; onRun: (fn: () => Promise<unknown>) => void }) {
  const { t } = useTranslation();
  const tone = b.status === 'confirmed' ? 'success' : b.status === 'pending' ? 'warning' : b.status === 'accepted' ? 'primary' : 'muted';
  const isAuthor = b.role === 'author';
  const when = new Date(b.departAt);

  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="h3" numberOfLines={1} style={{ flex: 1 }}>
          {b.route.from} ← {b.route.to}
        </T>
        <Pill label={t(`khatti.bookingStatus.${b.status}`)} tone={tone} />
      </Row>
      <Row gap={space.md}>
        <Row gap={4}>
          <Icon name="clock-outline" size={16} color={colors.muted} />
          <T v="small">{ltr(when.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }))}</T>
        </Row>
        <Row gap={4}>
          <Icon name="seat-outline" size={16} color={colors.muted} />
          <T v="small">{b.seats}</T>
        </Row>
        <T v="small" color={colors.primaryDark}>
          {iqd(b.price)} {t(`khatti.unit.${b.priceUnit}`)}
        </T>
      </Row>

      <Divider />

      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{b.other.name}</T>
          <T v="small">{b.other.phone ? ltr(b.other.phone) : t('khatti.phoneHidden')}</T>
        </View>
        {b.other.phone ? (
          <Row gap={space.sm}>
            <IconButton name="phone" bg={colors.primarySoft} color={colors.primary} onPress={() => callPhone(b.other.phone)} />
            <IconButton name="whatsapp" bg="#E7F8EE" color="#1FA855" onPress={() => openWhatsApp(b.other.phone)} />
          </Row>
        ) : null}
      </Row>

      {b.status === 'pending' && isAuthor ? (
        <Row gap={space.sm}>
          <Button small title={t('khatti.accept')} style={{ flex: 1 }} loading={busy} onPress={() => onRun(() => acceptBooking(b.id))} />
          <Button small kind="ghost" title={t('khatti.decline')} style={{ flex: 1 }} onPress={() => onRun(() => declineBooking(b.id))} />
        </Row>
      ) : null}

      {b.status === 'pending' && !isAuthor ? <T v="caption">{t('khatti.waitingAuthor')}</T> : null}

      {b.status === 'accepted' ? (
        !isAuthor ? (
          <Button small title={t('khatti.confirm')} loading={busy} onPress={() => onRun(() => confirmBooking(b.id))} />
        ) : (
          <T v="caption">{t('khatti.waitingBooker')}</T>
        )
      ) : null}

      {b.status === 'confirmed' ? (
        <Row gap={space.sm}>
          <Button
            small
            kind="secondary"
            icon="map-marker-account"
            title={t('khatti.sendLocation')}
            style={{ flex: 1 }}
            onPress={async () => {
              const f = (await freshFix(4000)) ?? getFix();
              if (!f) {
                Alert.alert('', t('khatti.noLocation'));
                return;
              }
              // موقعي بالواتساب: رابط خرائط يفتح عند الطرف الثاني
              openWhatsApp(b.other.phone, `https://maps.google.com/?q=${f.lat},${f.lng}`);
            }}
          />
          <Button
            small
            kind="ghost"
            icon="headset"
            title={t('khatti.reportLine')}
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/support/new', params: { khattiId: b.postId } })}
          />
        </Row>
      ) : null}

      {['pending', 'accepted', 'confirmed'].includes(b.status) ? (
        <Button
          small
          kind="ghost"
          title={t('khatti.cancelBooking')}
          onPress={() =>
            Alert.alert(t('khatti.cancelBooking'), t('khatti.cancelBookingBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.yes'), style: 'destructive', onPress: () => onRun(() => cancelBooking(b.id)) },
            ])
          }
        />
      ) : null}
    </Card>
  );
}
