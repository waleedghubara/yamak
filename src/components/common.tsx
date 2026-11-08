import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { callPhone, currentPosition, openWhatsApp, showError } from '../lib/device';
import { iqd, ltr } from '../lib/format';
import type { Ad, RideCaptain } from '../lib/types';
import { useAppConfig } from '../state/appConfig';
import { colors, fonts, radius, space } from '../theme';
import { Avatar, BottomModal, Button, Chip, Icon, IconButton, Input, Rating, Row, T } from './ui';

/** "الاتصال بالإنترنت ضعيف" */
export function NetworkBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOffline(s.isConnected === false || s.isInternetReachable === false);
      }),
    [],
  );
  if (!offline) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 4,
        alignSelf: 'center',
        backgroundColor: colors.text,
        borderRadius: radius.pill,
        paddingHorizontal: 16,
        paddingVertical: 6,
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <Icon name="wifi-off" size={16} color={colors.white} />
      <T v="small" color={colors.white}>
        {t('net.offline')}
      </T>
    </View>
  );
}

/** مساحة الإعلان أسفل الواجهة — تتغير من لوحة الإدارة */
export function AdBanner({ app }: { app: 'customer' | 'captain' }) {
  const [ad, setAd] = useState<Ad | null>(null);
  useEffect(() => {
    api<Ad[]>('/api/content/ads', { query: { app } })
      .then((ads) => setAd(ads[0] ?? null))
      .catch(() => {});
  }, [app]);
  if (!ad) return null;
  const open = () => {
    if (ad.actionUrl) Linking.openURL(ad.actionUrl).catch(() => {});
  };
  return (
    <Pressable onPress={open} style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.primarySoft }}>
      {ad.imageUrl ? (
        <Image source={{ uri: ad.imageUrl }} style={{ width: '100%', height: 84 }} resizeMode="cover" accessibilityLabel={ad.title} />
      ) : (
        <Row style={{ padding: space.md }}>
          <Icon name="ticket-percent" color={colors.primary} />
          <T v="bodyBold" color={colors.primaryDark} style={{ flex: 1 }}>
            {ad.title}
          </T>
        </Row>
      )}
    </Pressable>
  );
}

/** بطاقة الكابتن: الصورة، الاسم، التقييم، السيارة، اللوحة */
export function CaptainCard({ captain, onChat }: { captain: RideCaptain; onChat?: () => void }) {
  const { t } = useTranslation();
  return (
    <Row gap={space.md}>
      <Avatar uri={captain.photoUrl} name={captain.name} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row>
          <T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
            {captain.name}
          </T>
          <Rating value={captain.rating} />
        </Row>
        <T v="caption" numberOfLines={1}>
          {captain.carModel} · {captain.carColor}
        </T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8 }}>
            <T v="small" color={colors.primaryDark} style={{ fontFamily: fonts.bold }}>
              {t('ride.plate')}: {ltr(captain.plateNumber)}
            </T>
          </View>
          {captain.code ? (
            <View style={{ backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8 }}>
              <T v="small" color={colors.primaryDark} style={{ fontFamily: fonts.bold }}>
                {t('ride.captainCode')}: {ltr(String(captain.code))}
              </T>
            </View>
          ) : null}
        </Row>
      </View>
      <Row gap={space.sm}>
        {/* تواصل ويا الكابتن: اتصال، واتساب، أو مراسلة داخل التطبيق */}
        <IconButton name="phone" bg={colors.primarySoft} color={colors.primary} onPress={() => callPhone(captain.phone)} />
        <IconButton name="whatsapp" bg="#E7F8EE" color="#1FA855" onPress={() => openWhatsApp(captain.phone)} />
        {onChat ? <IconButton name="message-text" bg={colors.primarySoft} color={colors.primary} onPress={onChat} /> : null}
      </Row>
    </Row>
  );
}

/** اختيار سبب (إلغاء، بلاغ...) */
export function ReasonModal({
  visible,
  title,
  reasons,
  labelPrefix,
  warning,
  confirmLabel,
  withDetails,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  reasons: string[];
  labelPrefix: string;
  warning?: string | null;
  confirmLabel: string;
  withDetails?: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await onSubmit(reason, details.trim());
      setReason(null);
      setDetails('');
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomModal visible={visible} onClose={onClose} title={title}>
      {warning ? (
        <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.md }}>
          <T v="caption" color={colors.warning}>
            {warning}
          </T>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {reasons.map((r) => (
          <Chip key={r} label={t(`${labelPrefix}.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      {withDetails ? (
        <Input
          label={t('ride.reportDetails')}
          value={details}
          onChangeText={setDetails}
          multiline
          style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
        />
      ) : null}
      <Button title={confirmLabel} kind="danger" disabled={!reason} loading={busy} onPress={submit} />
    </BottomModal>
  );
}

/** الطوارئ: أرقام الجهات المختصة + تنبيه فوري للإدارة */
export function SosModal({ visible, rideId, onClose }: { visible: boolean; rideId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const alertAdmin = async () => {
    setBusy(true);
    try {
      const pos = await currentPosition();
      await api(`/api/rides/${rideId}/sos`, { body: { lat: pos?.lat ?? null, lng: pos?.lng ?? null } });
      setSent(true);
      Alert.alert(t('ride.sosTitle'), t('ride.sosSent'));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomModal visible={visible} onClose={onClose} title={t('ride.sosTitle')}>
      <T v="caption">{t('ride.sosBody')}</T>
      {cfg.emergencyNumbers.map((n) => (
        <Button
          key={n.number}
          kind={n.number === '911' ? 'primary' : 'ghost'}
          icon="phone"
          // 911 = رقم الطوارئ الموحد بالعراق (شرطة، إسعاف، دفاع مدني)
          title={`${n.number === '911' ? t('ride.sosUnified') : n.label} — ${ltr(n.number)}`}
          onPress={() => callPhone(n.number)}
        />
      ))}
      <Button kind="danger" icon="alert-octagon" title={sent ? t('ride.sosSent') : t('ride.sosAlertAdmin')} loading={busy} disabled={sent} onPress={alertAdmin} />
    </BottomModal>
  );
}

/** زر الطوارئ: يحتاج ضغط مطول حتى ما ينضغط بالغلط */
export function SosButton({ onTrigger }: { onTrigger: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => Alert.alert(t('ride.sosTitle'), t('ride.sosHold'))}
      onLongPress={onTrigger}
      delayLongPress={800}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.danger : colors.dangerSoft,
      })}
    >
      <Icon name="alert-octagon" size={18} color={colors.danger} />
      <T v="small" color={colors.danger} style={{ fontFamily: fonts.bold }}>
        {t('ride.sos')}
      </T>
    </Pressable>
  );
}

/** صف سعر: يعرض السعر القديم مشطوب إذا أكو خصم */
export function PriceText({ final, before, big }: { final: number; before?: number; big?: boolean }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {before && before > final ? (
        <T v="small" style={{ textDecorationLine: 'line-through' }}>
          {iqd(before)}
        </T>
      ) : null}
      <T v={big ? 'h2' : 'bodyBold'} color={colors.primaryDark}>
        {iqd(final)}
      </T>
    </View>
  );
}
