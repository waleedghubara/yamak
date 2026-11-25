import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, View } from 'react-native';
import { Button, Icon, Screen, T } from './ui';
import { useAppConfig } from '../state/appConfig';
import { colors, space } from '../theme';

/**
 * التحديث الإجباري: الإدارة ترفع «أقل إصدار» من الإعدادات،
 * فأي نسخة أقدم تتوقف وتطلع لها شاشة «حدّث التطبيق» ويا رابط المتجر.
 */
function older(current: string, min: string): boolean {
  const a = current.split('.').map((x) => parseInt(x, 10) || 0);
  const b = min.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

export function useUpdateRequired(): boolean {
  const cfg = useAppConfig();
  const min = cfg.minAppVersion?.trim();
  const current = Constants.expoConfig?.version ?? '0.0.0';
  return !!min && older(current, min);
}

export function UpdateScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const url = Platform.OS === 'ios' ? cfg.storeUrl?.ios : cfg.storeUrl?.android;
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl }}>
        <Icon name="cloud-download-outline" size={64} color={colors.primary} />
        <T v="h1" center>
          {t('update.title')}
        </T>
        <T v="body" center color={colors.textSoft}>
          {t('update.body', { version: cfg.minAppVersion ?? '' })}
        </T>
        {url ? <Button title={t('update.open')} icon="open-in-new" onPress={() => Linking.openURL(url).catch(() => {})} /> : null}
      </View>
    </Screen>
  );
}
