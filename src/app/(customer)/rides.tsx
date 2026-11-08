import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, View } from 'react-native';
import { Card, Chip, Divider, Empty, Icon, Pill, Row, Screen, T } from '../../components/ui';
import { api } from '../../lib/api';
import { dateTime, iqd, km, shortAddress } from '../../lib/format';
import type { Ride } from '../../lib/types';
import { setPendingBooking } from '../../state/placeBus';
import { colors, space } from '../../theme';

type Filter = 'current' | 'past' | 'cancelled';

/** رحلاتي: الحالية / السابقة / الملغاة */
export default function RidesScreen() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('past');
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRides(await api<Ride[]>('/api/rides', { query: { filter, limit: 50 } }));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen edges={['top']}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <T v="h1">{t('tabs.rides')}</T>
        <Row>
          {(['current', 'past', 'cancelled'] as Filter[]).map((f) => (
            <Chip key={f} label={t(`rides.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </Row>
      </View>
      <FlatList
        data={rides}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={loading ? null : <Empty icon="history" text={t('rides.empty')} />}
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/ride/${r.id}`)} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={6} style={{ flex: 1 }}>
                <Icon name={r.serviceType === 'delivery' ? 'package-variant-closed' : 'car'} size={18} color={colors.primary} />
                {r.number ? <T v="bodyBold">#{r.number}</T> : null}
                <T v="small">{dateTime(r.times.requestedAt ?? r.times.createdAt)}</T>
              </Row>
              <Pill
                label={t(`status.${r.status}`)}
                tone={r.status === 'COMPLETED' ? 'success' : r.status.startsWith('CANCELLED') || r.status === 'NO_DRIVER_FOUND' ? 'muted' : 'primary'}
              />
            </Row>
            <Row>
              <Icon name="alpha-a-circle" size={18} color={colors.primary} />
              <T v="body" numberOfLines={1} style={{ flex: 1 }}>
                {shortAddress(r.pickup)}
              </T>
            </Row>
            <Row>
              <Icon name="map-marker" size={18} color={colors.primaryDark} />
              <T v="body" numberOfLines={1} style={{ flex: 1 }}>
                {shortAddress(r.dropoff)}
              </T>
            </Row>
            <Divider style={{ marginVertical: 2 }} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption" numberOfLines={1} style={{ flex: 1 }}>
                {r.captain?.name ? `${r.captain.name} · ` : ''}
                {km(r.distanceKm)} · {t('book.cash')}
              </T>
              <T v="bodyBold" color={colors.primaryDark}>
                {iqd(r.fare.finalFare)}
              </T>
            </Row>
            {filter !== 'current' ? (
              <Chip
                icon="refresh"
                label={t('ride.orderAgain')}
                style={{ alignSelf: 'flex-start' }}
                onPress={() => {
                  setPendingBooking({ pickup: r.pickup, dropoff: r.dropoff, stops: r.stops });
                  router.push({ pathname: '/book', params: { service: r.serviceType ?? 'ride' } });
                }}
              />
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}
