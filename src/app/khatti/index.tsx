import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Button, Card, Chip, Divider, Empty, Header, Icon, Pill, Row, Screen, T } from '../../components/ui';
import { IS_CAPTAIN } from '../../config';
import { iqd, ltr } from '../../lib/format';
import { showError } from '../../lib/device';
import {
  activateSubscription,
  bookPost,
  getSubscription,
  listPosts,
  removePost,
  renewPost,
  PASSENGER_TYPES,
} from '../../lib/khatti';
import type { KhattiPost, KhattiSubscription, PassengerType } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { colors, fonts, radius, space } from '../../theme';

/**
 * خطي — لوحة الخطوط داخل كركوك.
 *   الزبون: يشوف خطوط الكباتن، يفلتر، ويطلب الانضمام (بدون أي رسوم عليه).
 *   الكابتن: يشوف طلبات الزبائن وخطوطه، ويدير اشتراكه الشهري.
 * الأرقام ما تظهر إلا بعد التأكيد المتبادل (شاشة الطلبات).
 */
export default function KhattiBoard() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const [posts, setPosts] = useState<KhattiPost[]>([]);
  const [sub, setSub] = useState<KhattiSubscription | null>(null);
  const [type, setType] = useState<PassengerType | null>(null);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    // الزبون يشوف عروض الكباتن، والكابتن يشوف طلبات الزبائن
    listPosts({ kind: mine ? undefined : IS_CAPTAIN ? 'request' : 'offer', passengerType: type ?? undefined, mine })
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
    if (IS_CAPTAIN) getSubscription().then(setSub).catch(() => {});
  }, [type, mine]);

  useFocusEffect(useCallback(() => load(), [load]));

  const join = async (p: KhattiPost, seats: number) => {
    setBusy(p.id);
    try {
      await bookPost(p.id, seats);
      Alert.alert('', t('khatti.requestSent'));
      router.push('/khatti/bookings');
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  };

  const subscribe = async () => {
    setBusy('sub');
    try {
      const s = await activateSubscription();
      setSub(s);
      Alert.alert('', s.state === 'free' ? t('khatti.sub.freeStarted', { months: s.freeMonths }) : t('khatti.sub.renewed'));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  };

  if (cfg.khattiEnabled === false) {
    return (
      <Screen>
        <Header title={t('khatti.title')} onBack={() => router.back()} />
        <Empty icon="account-group-outline" text={t('khatti.disabled')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={t('khatti.title')}
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => router.push('/khatti/bookings')} hitSlop={8}>
            <Icon name="account-clock-outline" color={colors.primary} />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      >
        <T v="caption">{t('khatti.intro')}</T>

        {IS_CAPTAIN && sub ? <SubscriptionCard sub={sub} busy={busy === 'sub'} onSubscribe={subscribe} /> : null}

        {/* الفلاتر السريعة */}
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Chip label={t('khatti.filters.all')} selected={!type} onPress={() => setType(null)} />
          {PASSENGER_TYPES.map((p) => (
            <Chip key={p} label={t(`khatti.types.${p}`)} selected={type === p} onPress={() => setType(p)} />
          ))}
        </Row>
        <Row gap={space.sm}>
          <Chip icon="view-list-outline" label={IS_CAPTAIN ? t('khatti.customerRequests') : t('khatti.captainLines')} selected={!mine} onPress={() => setMine(false)} />
          <Chip icon="account-outline" label={t('khatti.mine')} selected={mine} onPress={() => setMine(true)} />
        </Row>

        <Button
          icon="plus"
          title={IS_CAPTAIN ? t('khatti.newOffer') : t('khatti.newRequest')}
          kind="secondary"
          onPress={() => router.push('/khatti/new')}
        />

        {!posts.length && !loading ? <Empty icon="account-group-outline" text={t('khatti.empty')} /> : null}

        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            busy={busy === p.id}
            onJoin={(seats) => join(p, seats)}
            onRenew={async () => {
              try {
                setPosts(await Promise.resolve().then(() => posts.map((x) => x)));
                await renewPost(p.id);
                load();
              } catch (err) {
                showError(err);
              }
            }}
            onRemove={() =>
              Alert.alert(t('khatti.removeTitle'), t('khatti.removeBody'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await removePost(p.id);
                      load();
                    } catch (err) {
                      showError(err);
                    }
                  },
                },
              ])
            }
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

function SubscriptionCard({ sub, busy, onSubscribe }: { sub: KhattiSubscription; busy: boolean; onSubscribe: () => void }) {
  const { t } = useTranslation();
  if (sub.state === 'not_required') return null;
  const until = sub.state === 'free' ? sub.freeUntil : sub.paidUntil;
  const tone = sub.active ? 'success' : 'warning';
  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="h3">{t('khatti.sub.title')}</T>
        <Pill label={t(`khatti.sub.state.${sub.state}`)} tone={tone} />
      </Row>
      <T v="caption">
        {sub.state === 'none'
          ? t('khatti.sub.firstHint', { months: sub.freeMonths, fee: iqd(sub.monthlyFee) })
          : until
            ? t('khatti.sub.until', { date: new Date(until).toLocaleDateString('en-GB') })
            : ''}
      </T>
      {!sub.active || sub.state === 'expired' ? (
        <Button
          title={sub.state === 'none' ? t('khatti.sub.start') : t('khatti.sub.renew', { fee: iqd(sub.monthlyFee) })}
          loading={busy}
          onPress={onSubscribe}
        />
      ) : null}
      <T v="small">{t('khatti.sub.note')}</T>
    </Card>
  );
}

function PostCard({
  post,
  busy,
  onJoin,
  onRenew,
  onRemove,
}: {
  post: KhattiPost;
  busy: boolean;
  onJoin: (seats: number) => void;
  onRenew: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [seats, setSeats] = useState(1);
  const when = new Date(post.departAt);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  const day = when.toLocaleDateString('en-GB');
  const full = post.seatsLeft <= 0 || post.status !== 'active';
  const maxSeats = Math.max(1, Math.min(post.seatsLeft, 4));

  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.primaryDark, lineHeight: 22 }}>
              {t(`khatti.types.${post.passengerType}`)}
            </T>
          </View>
          {post.mine ? <Pill label={t('khatti.mine')} tone="muted" /> : null}
          {post.status !== 'active' ? <Pill label={t(`khatti.status.${post.status}`)} tone={post.status === 'rejected' ? 'danger' : 'warning'} /> : null}
        </Row>
        <T v="bodyBold" color={colors.primaryDark}>
          {iqd(post.price)}
          <T v="small"> {t(`khatti.unit.${post.priceUnit}`)}</T>
        </T>
      </Row>

      <Row gap={6}>
        <Icon name="map-marker-outline" size={18} color={colors.primary} />
        <T v="body" style={{ flex: 1 }} numberOfLines={2}>
          {post.from.label} ← {post.to.label}
        </T>
      </Row>
      <Row gap={space.md}>
        <Row gap={4}>
          <Icon name="clock-outline" size={16} color={colors.muted} />
          <T v="small">
            {ltr(day)} · {ltr(time)}
          </T>
        </Row>
        <Row gap={4}>
          <Icon name="seat-outline" size={16} color={colors.muted} />
          <T v="small">{t('khatti.seatsLeft', { left: post.seatsLeft, total: post.seatsTotal })}</T>
        </Row>
      </Row>
      {post.note ? <T v="caption">{post.note}</T> : null}

      {post.kind === 'offer' && (post.author.captainPhotoUrl || post.author.carPhotoUrl) ? (
        <Row gap={space.sm}>
          {post.author.captainPhotoUrl ? (
            <Image source={{ uri: post.author.captainPhotoUrl }} style={{ width: 54, height: 54, borderRadius: radius.sm }} />
          ) : null}
          {post.author.carPhotoUrl ? (
            <Image source={{ uri: post.author.carPhotoUrl }} style={{ width: 84, height: 54, borderRadius: radius.sm }} />
          ) : null}
          <View style={{ flex: 1 }}>
            <T v="bodyBold">{post.author.name}</T>
            {post.author.car ? <T v="small">{post.author.car}</T> : null}
          </View>
        </Row>
      ) : null}

      {post.mine ? (
        <>
          <Divider />
          {post.adminNote ? (
            <T v="small" color={colors.danger}>
              {post.adminNote}
            </T>
          ) : null}
          <Row gap={space.sm}>
            <Button small kind="secondary" icon="refresh" title={t('khatti.renew')} style={{ flex: 1 }} onPress={onRenew} />
            <Button small kind="ghost" icon="trash-can-outline" title={t('common.delete')} style={{ flex: 1 }} onPress={onRemove} />
          </Row>
        </>
      ) : (
        <>
          <Divider />
          {post.kind === 'offer' ? (
            <Row gap={space.sm} style={{ justifyContent: 'space-between' }}>
              <Row gap={space.sm}>
                {Array.from({ length: maxSeats }, (_, i) => i + 1).map((n) => (
                  <Chip key={n} label={String(n)} selected={seats === n} onPress={() => setSeats(n)} />
                ))}
              </Row>
              <Button small title={t('khatti.join')} loading={busy} disabled={full} onPress={() => onJoin(seats)} />
            </Row>
          ) : (
            <Button small title={t('khatti.offerRide')} loading={busy} disabled={full} onPress={() => onJoin(1)} />
          )}
        </>
      )}
    </Card>
  );
}
