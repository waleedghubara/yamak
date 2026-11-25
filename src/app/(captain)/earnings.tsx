import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { DebtMeter } from '../../components/DebtMeter';
import { DocPicker, type DocValue } from '../../components/DocPicker';
import { BottomModal, Button, Card, Chip, Empty, Icon, Input, Pill, Rating, Row, Screen, T } from '../../components/ui';
import { api, fileUrl } from '../../lib/api';
import { showError } from '../../lib/device';
import { dateTime, iqd, ltr } from '../../lib/format';
import { useAuth } from '../../state/auth';
import { useSocketEvent } from '../../state/socket';
import { colors, fonts, radius, space } from '../../theme';
import type { CaptainSummary } from './home';

interface LedgerRow {
  type: 'ride' | 'payment';
  id: string;
  at: string;
  rideNumber: string | null;
  fare: number | null;
  commission: number | null;
  discount: number | null;
  amount: number;
  kind: string | null;
  note: string | null;
}

interface Receipt {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  imageUrl: string | null;
}

/**
 * حساب الكابتن ويا الشركة:
 *   اليوم + مؤشر المستحقات (تنبيه 13,000 — إيقاف 15,000)
 *   + معلومات التحويل (ماستر) + رفع وصل التسديد ← الإدارة تصفر الحساب
 *   + كشف الحساب: عمولة كل رحلة، الخصومات اللي تنضاف لك، التسديدات
 */
export default function EarningsScreen() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const [summary, setSummary] = useState<CaptainSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [serial, setSerial] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [tab, setTab] = useState<'ledger' | 'receipts'>('ledger');

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      api<CaptainSummary>('/api/captain/summary').then(setSummary).catch(() => {}),
      api<LedgerRow[]>('/api/captain/ledger').then(setLedger).catch(() => {}),
      api<Receipt[]>('/api/captain/receipts').then(setReceipts).catch(() => {}),
    ]);
    setLoading(false);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useSocketEvent('captain:status', () => load());

  /** سلفة الطوارئ: مرة واحدة، ترفع حد الإيقاف لحد ما يسدد كامل المبلغ */
  const takeAdvance = () =>
    Alert.alert(t('captain.advance.title'), t('captain.advance.confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.yes'),
        onPress: async () => {
          setAdvancing(true);
          try {
            await api('/api/captain/advance', { body: {} });
            load();
            Alert.alert('', t('captain.advance.done'));
          } catch (err) {
            showError(err);
          } finally {
            setAdvancing(false);
          }
        },
      },
    ]);

  /** شحن بطاقة: 8 أرقام، تستعمل مرة وحدة (قفل 15 دقيقة بعد 5 محاولات خاطئة) */
  const redeem = async () => {
    setRedeeming(true);
    try {
      const r = await api<{ value: number; balanceOwed: number }>('/api/captain/cards/redeem', { body: { serial } });
      setSerial('');
      load();
      Alert.alert('', t('captain.cards.done', { amount: iqd(r.value) }));
    } catch (err) {
      showError(err);
    } finally {
      setRedeeming(false);
    }
  };

  const discountsTotal = ledger.reduce((a, r) => a + (r.type === 'ride' ? (r.discount ?? 0) : 0), 0);

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        <T v="h1">{t('captain.earnings.title')}</T>
        {summary ? (
          <>
            <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary, gap: space.sm }}>
              <T v="caption" color={colors.primaryMuted}>
                {t('captain.earnings.today')}
              </T>
              <T style={{ fontFamily: fonts.black, fontSize: 32, lineHeight: 46, color: colors.white }}>{iqd(summary.today.cash)}</T>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" color={colors.primaryMuted}>
                  {summary.today.trips} {t('captain.earnings.trips')}
                </T>
                <T v="small" color={colors.primaryMuted}>
                  {t('captain.earnings.commission')}: {iqd(summary.today.commission)}
                </T>
              </Row>
            </Card>

            {/* بطاقة الكابتن: الاسم ورقم الكابتن */}
            <Card style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="h3">{me?.user.name}</T>
                {me?.captain?.code ? (
                  <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 2 }}>
                    <T v="bodyBold" color={colors.primaryDark}>
                      {t('ride.captainCode')} {ltr(String(me.captain.code))}
                    </T>
                  </View>
                ) : null}
              </Row>
              {me?.captain ? (
                <T v="small">
                  {me.captain.carModel} · {me.captain.carColor} · {ltr(me.captain.plateNumber)}
                </T>
              ) : null}
            </Card>

            <DebtMeter balance={summary.balanceOwed} warnAt={summary.warnAt} maxDebt={summary.effectiveMaxDebt ?? summary.maxDebt} pendingReceipt={!!summary.pendingReceipt} />

            {/* سلفة الطوارئ: مرة واحدة عند بلوغ حد الإيقاف، ترفع الحد لحد ما يسدد كامل المبلغ */}
            {summary.canTakeAdvance ? (
              <Card style={{ gap: space.sm, borderColor: colors.warning }}>
                <Row gap={6}>
                  <Icon name="lifebuoy" color={colors.warning} />
                  <T v="h3">{t('captain.advance.title')}</T>
                </Row>
                <T v="caption">{t('captain.advance.body', { amount: iqd(summary.advanceAmount ?? 0), max: iqd(summary.effectiveMaxDebt ?? summary.maxDebt) })}</T>
                <Button
                  kind="secondary"
                  icon="lifebuoy"
                  title={t('captain.advance.take', { amount: iqd(summary.advanceAmount ?? 0) })}
                  loading={advancing}
                  onPress={takeAdvance}
                />
              </Card>
            ) : null}
            {summary.advanceActive ? (
              <Row style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft }}>
                <Icon name="lifebuoy" color={colors.warning} />
                <T v="small" color={colors.textSoft} style={{ flex: 1 }}>
                  {t('captain.advance.active', { amount: iqd(summary.payInFull ?? summary.balanceOwed) })}
                </T>
              </Row>
            ) : null}

            {/* التسديد: تحويل ماستر + رفع الوصل */}
            <Card style={{ gap: space.sm }}>
              <Row gap={6}>
                <Icon name="credit-card-outline" color={colors.primary} />
                <T v="h3">{t('captain.receipt.howToPay')}</T>
              </Row>
              <T v="body" color={colors.textSoft} selectable>
                {summary.paymentInfo || t('captain.receipt.noPaymentInfo')}
              </T>
              <T v="small">{t('captain.receipt.steps')}</T>
              <Button
                title={summary.pendingReceipt ? t('captain.receipt.pending') : t('captain.receipt.upload')}
                icon="receipt"
                disabled={!!summary.pendingReceipt || summary.balanceOwed <= 0}
                onPress={() => setPayOpen(true)}
              />
            </Card>

            {/* شحن بطاقة: «قريباً» لحد ما الإدارة تفعّله */}
            <Card style={{ gap: space.sm }}>
              <Row gap={6}>
                <Icon name="card-text-outline" color={colors.primary} />
                <T v="h3">{t('captain.cards.title')}</T>
                {!summary.cardsEnabled ? <Pill label={t('common.comingSoon')} tone="muted" /> : null}
              </Row>
              <T v="caption">{summary.cardsEnabled ? t('captain.cards.body') : t('captain.cards.soon')}</T>
              {summary.cardsEnabled ? (
                <Row gap={space.sm}>
                  <Input
                    containerStyle={{ flex: 1 }}
                    value={serial}
                    onChangeText={(v) => setSerial(v.replace(/[^\d]/g, '').slice(0, 8))}
                    placeholder="12345678"
                    keyboardType="number-pad"
                    maxLength={8}
                  />
                  <Button title={t('captain.cards.redeem')} loading={redeeming} disabled={serial.length !== 8} onPress={redeem} />
                </Row>
              ) : null}
            </Card>

            <Row gap={space.md}>
              <Card style={{ flex: 1, gap: 4 }}>
                <T v="small">{t('captain.earnings.rating')}</T>
                {summary.rating ? <Rating value={summary.rating} /> : <T v="h3">—</T>}
                <T v="small">
                  {summary.totalTrips} {t('captain.earnings.trips')}
                </T>
              </Card>
              <Card style={{ flex: 1, gap: 4 }}>
                <T v="small">{t('captain.earnings.discountCredits')}</T>
                <T v="h3" color={colors.success}>
                  {iqd(discountsTotal)}
                </T>
                <T v="small">{t('captain.earnings.discountHint')}</T>
              </Card>
            </Row>
          </>
        ) : null}

        <Row>
          <Chip label={t('captain.earnings.ledger')} selected={tab === 'ledger'} onPress={() => setTab('ledger')} />
          <Chip label={t('captain.receipt.history')} selected={tab === 'receipts'} onPress={() => setTab('receipts')} />
        </Row>

        {tab === 'ledger' ? (
          ledger.length ? (
            <Card style={{ padding: 0 }}>
              {ledger.map((r, i) => (
                <View key={`${r.type}-${r.id}`} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <View style={[styles.rowIcon, { backgroundColor: r.type === 'ride' ? colors.primarySoft : colors.successSoft }]}>
                    <Icon name={r.type === 'ride' ? 'car' : 'cash-check'} size={18} color={r.type === 'ride' ? colors.primary : colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="bodyBold" numberOfLines={1}>
                      {r.type === 'ride' ? t('captain.earnings.rideN', { n: r.rideNumber ?? '' }) : t(`captain.payKind.${r.kind ?? 'payment'}`)}
                    </T>
                    <T v="small" numberOfLines={2}>
                      {dateTime(r.at)}
                      {r.type === 'ride' ? ` · ${t('captain.earnings.commission')} ${iqd(r.commission)}` : ''}
                      {r.discount ? ` · ${t('captain.earnings.discountAdded', { amount: iqd(r.discount) })}` : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </T>
                  </View>
                  <T v="bodyBold" color={r.amount > 0 ? colors.danger : colors.success}>
                    {r.amount > 0 ? '+' : '−'}
                    {iqd(Math.abs(r.amount))}
                  </T>
                </View>
              ))}
            </Card>
          ) : (
            <Empty icon="history" text={t('rides.empty')} />
          )
        ) : receipts.length ? (
          <View style={{ gap: space.sm }}>
            {receipts.map((r) => (
              <Card key={r.id} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                {r.imageUrl ? <Image source={{ uri: fileUrl(r.imageUrl)! }} style={styles.receiptImg} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyBold">{iqd(r.amount)}</T>
                  <T v="small">{dateTime(r.createdAt)}</T>
                  {r.adminNote ? <T v="small">{r.adminNote}</T> : null}
                </View>
                <Pill
                  label={t(`captain.receipt.status.${r.status}`)}
                  tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'danger'}
                />
              </Card>
            ))}
          </View>
        ) : (
          <Empty icon="receipt" text={t('captain.receipt.none')} />
        )}
      </ScrollView>

      {summary ? (
        <ReceiptModal
          /* يرجع المبلغ للرصيد الحالي كل مرة تنفتح النافذة */
          key={`${payOpen}-${summary.balanceOwed}`}
          visible={payOpen}
          balance={summary.balanceOwed}
          onClose={() => setPayOpen(false)}
          onSent={() => {
            setPayOpen(false);
            Alert.alert('', t('captain.receipt.sent'));
            load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function ReceiptModal({ visible, balance, onClose, onSent }: { visible: boolean; balance: number; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(balance));
  const [photo, setPhoto] = useState<DocValue | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(amount.replace(/[^\d]/g, ''));

  const send = async () => {
    setBusy(true);
    try {
      await api('/api/captain/receipts', { body: { amount: n, documentId: photo!.id, note: note.trim() || null } });
      setPhoto(null);
      setNote('');
      onSent();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomModal visible={visible} onClose={onClose} title={t('captain.receipt.upload')}>
      <Input
        label={t('captain.receipt.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
        style={{ textAlign: 'left', fontFamily: fonts.bold, fontSize: 18 }}
      />
      <Row>
        <Pressable onPress={() => setAmount(String(balance))}>
          <T v="small" color={colors.primary}>
            {t('captain.receipt.fullAmount', { amount: iqd(balance) })}
          </T>
        </Pressable>
      </Row>
      <DocPicker kind="receipt" label={t('captain.receipt.photo')} value={photo} onChange={setPhoto} icon="receipt" height={150} />
      <Input label={t('common.optional')} placeholder={t('captain.receipt.notePlaceholder')} value={note} onChangeText={setNote} maxLength={300} />
      <Button title={t('common.send')} loading={busy} disabled={!photo || !n} onPress={send} />
    </BottomModal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  receiptImg: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.border },
});
