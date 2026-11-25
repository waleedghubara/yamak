import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';
import { Card, Header, ListItem, Screen, T } from '../components/ui';
import { IS_CAPTAIN } from '../config';
import { ltr } from '../lib/format';
import { useAppConfig } from '../state/appConfig';
import { space } from '../theme';

/** حول التطبيق: الإصدار + الإسناد الكامل لمصادر الخرائط (شرط ترخيص OSM) + التواصل */
export default function AboutScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const phone = cfg.supportPhone;

  return (
    <Screen>
      <Header title={t('about.title')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Card style={{ alignItems: 'center', gap: space.xs }}>
          <T v="logo">{t(IS_CAPTAIN ? 'captainAppName' : 'appName')}</T>
          <T v="caption">
            {t('about.version')} {ltr(Constants.expoConfig?.version ?? '')}
          </T>
        </Card>

        <View style={{ gap: space.sm }}>
          <T v="h3">{t('about.mapTitle')}</T>
          <T v="caption">{t('about.mapBody')}</T>
          <Card style={{ padding: space.sm }}>
            <ListItem icon="open-in-new" title="OpenStreetMap" subtitle="openstreetmap.org/copyright" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} />
            <ListItem icon="open-in-new" title="OpenFreeMap" subtitle="openfreemap.org" onPress={() => Linking.openURL('https://openfreemap.org/')} />
            <ListItem icon="open-in-new" title="OSRM" subtitle="project-osrm.org" onPress={() => Linking.openURL('https://project-osrm.org/')} />
            <ListItem icon="open-in-new" title="Nominatim" subtitle="nominatim.org" onPress={() => Linking.openURL('https://nominatim.org/')} />
          </Card>
        </View>

        {phone ? (
          <View style={{ gap: space.sm }}>
            <T v="h3">{t('about.contact')}</T>
            <Card style={{ padding: space.sm }}>
              <ListItem icon="phone" title={ltr(phone)} onPress={() => Linking.openURL(`tel:${phone}`)} />
              {cfg.termsUrl ? <ListItem icon="file-document-outline" title={t('account.terms')} onPress={() => Linking.openURL(cfg.termsUrl)} /> : null}
              {cfg.privacyUrl ? <ListItem icon="shield-lock-outline" title={t('account.privacy')} onPress={() => Linking.openURL(cfg.privacyUrl)} /> : null}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
