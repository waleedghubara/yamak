import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Loading, T } from '../components/ui';
import { IS_CAPTAIN } from '../config';
import { profileComplete } from '../lib/profile';
import { useAuth } from '../state/auth';
import { boot } from '../state/boot';
import { colors, space } from '../theme';

/** نقطة البداية: يقرر وين يروح المستخدم */
export default function Index() {
  const { t } = useTranslation();
  const { ready, token, me, refreshMe } = useAuth();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <Loading />;
  if (!boot.langChosen) return <Redirect href="/language" />;
  if (!token) return <Redirect href="/login" />;
  if (!me) {
    // عنده حساب بس النت مقطوع
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl, backgroundColor: colors.bg }}>
        <T v="logo">{t('appName')}</T>
        <T v="body" center>
          {t('errors.network_error')}
        </T>
        <Button
          title={t('common.retry')}
          loading={retrying}
          onPress={async () => {
            setRetrying(true);
            await refreshMe();
            setRetrying(false);
          }}
        />
      </View>
    );
  }
  // معلومات إلزامية ناقصة (الكابتن: صورة شخصية، الزبون: الاسم الثلاثي وتاريخ الميلاد)
  if (!profileComplete(me)) return <Redirect href="/profile-setup" />;
  return <Redirect href={IS_CAPTAIN ? '/(captain)/home' : '/(customer)/home'} />;
}
