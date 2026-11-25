import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, View } from 'react-native';
import { BottomModal, Button, Icon, Row, T } from './ui';
import { KEYS, storage } from '../lib/storage';
import { colors, space } from '../theme';

/**
 * «بدون قيود للبطارية» — خطوة إذن ضمن إعداد تطبيق الكابتن:
 * أجهزة شاومي وهواوي وأوبو وبعض سامسونغ توقف خدمة الموقع بعد فترة والشاشة مطفية،
 * فالكابتن ما تبقى توصله طلبات. الزر يفتح صفحة إعدادات التطبيق حتى يختار «بدون قيود».
 * تطلع مرة وحدة لكل إصدار (بعد كل تحديث للتطبيق)، ويكدر يفتحها من «حسابي» أي وقت.
 */
const STEPS = 3;

export async function batteryNoticeNeeded(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const done = await storage.get(KEYS.batteryOkVersion);
  return done !== (Constants.expoConfig?.version ?? '0.0.0');
}

export function BatteryNotice({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <BottomModal visible={visible} onClose={onClose} title={t('battery.title')}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Icon name="battery-alert-variant-outline" size={28} color={colors.warning} />
        <T v="body" style={{ flex: 1 }} color={colors.textSoft}>
          {t('battery.body')}
        </T>
      </Row>
      <View style={{ gap: 6 }}>
        {Array.from({ length: STEPS }, (_, i) => (
          <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <T v="bodyBold" color={colors.primary}>
              {i + 1}.
            </T>
            <T v="body" style={{ flex: 1 }}>
              {t(`battery.step${i + 1}`)}
            </T>
          </Row>
        ))}
      </View>
      <Button title={t('battery.open')} onPress={() => Linking.openSettings().catch(() => {})} />
      <Button
        title={t('battery.done')}
        kind="ghost"
        onPress={async () => {
          await storage.set(KEYS.batteryOkVersion, Constants.expoConfig?.version ?? '0.0.0');
          onClose();
        }}
      />
    </BottomModal>
  );
}

/** تطلع النافذة أول مرة بعد كل تحديث، لما الكابتن يصير متصل */
export function useBatteryNotice(online: boolean): [boolean, () => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!online) return;
    let alive = true;
    batteryNoticeNeeded().then((need) => {
      if (alive && need) setShow(true);
    });
    return () => {
      alive = false;
    };
  }, [online]);
  return [show, () => setShow(false)];
}
