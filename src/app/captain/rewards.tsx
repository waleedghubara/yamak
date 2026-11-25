import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Card, Empty, Header, Icon, Pill, Row, Screen, T } from '../../components/ui';
import { api } from '../../lib/api';
import { iqd, km, ltr } from '../../lib/format';
import type { Reward } from '../../lib/types';
import { colors, fonts, radius, space } from '../../theme';

/**
 * مكافآت الكابتن: شريط تقدم لكل مكافأة فعالة.
 * المبلغ ينضاف تلقائياً لحسابك أول ما توصل العدد المطلوب (مرة واحدة لكل مكافأة).
 */
export default function RewardsScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Reward[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<Reward[]>('/api/captain/rewards'));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api<Reward[]>('/api/captain/rewards')
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Screen>
      <Header title={t('captain.rewards.title')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(captain)/home'))} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      >
        <T v="caption">{t('captain.rewards.hint')}</T>
        {items && !items.length ? <Empty icon="trophy-outline" text={t('captain.rewards.empty')} /> : null}
        {(items ?? []).map((r) => {
          const pct = Math.min(100, Math.round((r.progress / r.tripsRequired) * 100));
          const ends = new Date(r.endsAt);
          return (
            <Card key={r.id} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="h3" style={{ flex: 1 }} numberOfLines={1}>
                  {r.title}
                </T>
                {r.earned ? <Pill label={t('captain.rewards.earned')} tone="success" /> : <T v="bodyBold" color={colors.primaryDark}>{iqd(r.amount)}</T>}
              </Row>

              <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: r.earned ? colors.success : colors.primary }} />
              </View>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" style={{ fontFamily: fonts.bold }}>
                  {t('captain.rewards.progress', { done: r.progress, total: r.tripsRequired })}
                </T>
                <T v="small">{ltr(`${pct}%`)}</T>
              </Row>

              <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
                <Row gap={4}>
                  <Icon name="calendar-end" size={16} color={colors.muted} />
                  <T v="small">{t('captain.rewards.until', { date: ends.toLocaleDateString('en-GB') })}</T>
                </Row>
                <Row gap={4}>
                  <Icon name="map-marker-distance" size={16} color={colors.muted} />
                  <T v="small">{t('captain.rewards.minTrip', { km: km(r.minTripKm) })}</T>
                </Row>
              </Row>
              <T v="small">{t('captain.rewards.rules')}</T>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
