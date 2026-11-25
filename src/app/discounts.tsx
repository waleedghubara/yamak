import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Button, Card, Empty, Header, Row, Screen, T } from '../components/ui';
import { api } from '../lib/api';
import { iqd, ltr } from '../lib/format';
import type { PromoBanner } from '../lib/types';
import { useAppConfig } from '../state/appConfig';
import { setPendingBooking } from '../state/placeBus';
import { colors, fonts, radius, space } from '../theme';

/** الخصومات: أكواد يمك الفعالة — ضغطة وحدة تفتح الطلب والكود مطبّق (بدون نسخ ولا كتابة) */
export default function DiscountsScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const [promos, setPromos] = useState<PromoBanner[] | null>(null);

  useEffect(() => {
    api<PromoBanner[]>('/api/rides/promo-banners')
      .then(setPromos)
      .catch(() => setPromos([]));
  }, []);

  const use = (code: string) => {
    setPendingBooking({ promo: code });
    router.push({ pathname: '/book', params: { step: 'pickup' } });
  };

  return (
    <Screen>
      <Header title={t('account.discounts')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(customer)/home'))} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <T v="caption">{t('discounts.hint', { max: cfg.promoMaxPerDay ?? 2 })}</T>

        {promos && !promos.length ? <Empty icon="ticket-percent-outline" text={t('discounts.empty')} /> : null}

        {(promos ?? []).map((p) => (
          <Card key={p.code} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 4 }}>
                <T style={{ fontFamily: fonts.black, fontSize: 17, color: colors.primaryDark, lineHeight: 28 }}>{ltr(p.code)}</T>
              </View>
              <T v="bodyBold" color={colors.success}>
                {p.kind === 'percent' ? `${p.value}%` : iqd(p.value)}
              </T>
            </Row>
            {p.text ? <T v="body">{p.text}</T> : null}
            <Button title={t('discounts.use')} onPress={() => use(p.code)} />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
