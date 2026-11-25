import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { balanceColor, creditOf, CREDIT_FULL } from '../lib/balance';
import { iqd } from '../lib/format';
import { colors, fonts, radius, space } from '../theme';
import { Icon, Row, T } from './ui';

/**
 * رصيد الكابتن ويا الشركة:
 *   رصيد إله ← «رصيدك الحالي» أخضر ويحمر تدريجياً لحد الصفر
 *   عليه للشركة ← «مطلوب للشركة» بالأحمر، وعند حد الإيقاف (15,000) أحمر غامق
 */
export function DebtMeter({
  balance,
  warnAt,
  maxDebt,
  pendingReceipt,
  compact,
}: {
  balance: number;
  warnAt: number;
  maxDebt: number;
  pendingReceipt?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  // رصيد إله (مثل هدية 25,000): «رصيدك الحالي» بالأخضر ويحمر تدريجياً كلما نقص
  if (balance <= 0) {
    const credit = creditOf(balance);
    const c = balanceColor(balance);
    return (
      <View style={[styles.box, { backgroundColor: colors.card, borderColor: c }]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6} style={{ flex: 1 }}>
            <Icon name="wallet-outline" size={20} color={c} />
            <T v="small" style={{ flex: 1 }} numberOfLines={1}>
              {t('captain.debt.balanceNow')}
            </T>
          </Row>
          <T style={[styles.amount, { color: c }]}>{iqd(credit)}</T>
        </Row>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(1, credit / CREDIT_FULL) * 100}%`, backgroundColor: c }]} />
        </View>
        <T v="small" color={colors.muted} numberOfLines={compact ? 2 : undefined}>
          {t('captain.debt.balanceHint')}
        </T>
        {pendingReceipt ? (
          <Row gap={6}>
            <Icon name="timer-sand" size={16} color={colors.primary} />
            <T v="small" color={colors.primary}>
              {t('captain.receipt.pending')}
            </T>
          </Row>
        ) : null}
      </View>
    );
  }
  const state = balance >= maxDebt ? 'blocked' : balance >= warnAt ? 'warning' : 'ok';
  const pct = Math.max(0, Math.min(1, balance / Math.max(1, maxDebt)));
  // عليه للشركة: أحمر (أغمق كلما قرب من حد الإيقاف)
  const color = state === 'blocked' ? 'hsl(0, 75%, 28%)' : colors.danger;
  const bg = state === 'blocked' || state === 'warning' ? colors.dangerSoft : colors.card;
  const msg =
    state === 'blocked'
      ? t('captain.debt.blockedShort')
      : state === 'warning'
        ? t('captain.debt.warningShort', { max: iqd(maxDebt) })
        : t('captain.debt.okShort', { max: iqd(maxDebt) });
  return (
    <View style={[styles.box, { backgroundColor: bg, borderColor: color }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ flex: 1 }}>
          <Icon name={state === 'ok' ? 'wallet-outline' : 'alert-circle'} size={20} color={color} />
          <T v="small" style={{ flex: 1 }} numberOfLines={1}>
            {t('captain.debt.dueToCompany')}
          </T>
        </Row>
        <T style={[styles.amount, { color }]}>-{iqd(balance)}</T>
      </Row>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        {/* علامة حد التنبيه — بنفس اتجاه التعبئة */}
        <View pointerEvents="none" style={styles.markRow}>
          <View style={{ width: `${Math.min(100, (warnAt / Math.max(1, maxDebt)) * 100)}%` }} />
          <View style={styles.mark} />
        </View>
      </View>
      <T v="small" color={color} numberOfLines={compact ? 2 : undefined}>
        {msg}
      </T>
      {pendingReceipt ? (
        <Row gap={6}>
          <Icon name="timer-sand" size={16} color={colors.primary} />
          <T v="small" color={colors.primary}>
            {t('captain.receipt.pending')}
          </T>
        </Row>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: 8 },
  amount: { fontFamily: fonts.heavy, fontSize: 18, lineHeight: 26 },
  track: { height: 10, borderRadius: 5, backgroundColor: '#ECE6F5', overflow: 'hidden', flexDirection: 'row' },
  fill: { height: '100%', borderRadius: 5 },
  markRow: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  mark: { width: 2, height: '100%', backgroundColor: colors.text, opacity: 0.45 },
});
