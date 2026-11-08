import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { Avatar, BottomModal, Card, Icon, Input, ListItem, Row, Screen, T, Button } from '../components/ui';
import { IS_CAPTAIN } from '../config';
import { currentLang, LANGS, setLanguage } from '../i18n';
import { api } from '../lib/api';
import { showError } from '../lib/device';
import { ltr } from '../lib/format';
import { pickAndUploadPhoto, takeAndUploadSelfie } from '../lib/photo';
import { isTriple } from '../lib/profile';
import type { Me } from '../lib/types';
import { useAppConfig } from '../state/appConfig';
import { useAuth } from '../state/auth';
import { colors, radius, space } from '../theme';

/** حسابي: الاسم، الهاتف، الصورة، اللغة، الدعم، الشروط، الخصوصية، تسجيل الخروج */
export default function AccountScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const { me, setMe, signOut } = useAuth();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(me?.user.name ?? '');
  const [langOpen, setLangOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    if (!IS_CAPTAIN && !isTriple(name)) {
      Alert.alert('', t('errors.triple_name_required'));
      return;
    }
    setBusy(true);
    try {
      setMe(await api<Me>('/api/me', { method: 'PATCH', body: { name: name.trim() } }));
      setEditName(false);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async () => {
    try {
      const m = IS_CAPTAIN ? await takeAndUploadSelfie() : await pickAndUploadPhoto();
      if (m) setMe(m);
    } catch (err) {
      showError(err);
    }
  };

  const changeLang = async (code: (typeof LANGS)[number]['code']) => {
    setLangOpen(false);
    try {
      await api('/api/me', { method: 'PATCH', body: { lang: code } });
    } catch {
      // ignore
    }
    await setLanguage(code);
  };

  const logout = () =>
    Alert.alert(t('account.logout'), t('account.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.logout'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);

  const deleteAccount = () =>
    Alert.alert(t('account.deleteTitle'), t('account.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/api/me', { method: 'DELETE' });
          } catch (err) {
            showError(err);
            return;
          }
          await signOut();
          router.replace('/login');
          Alert.alert('', t('account.deleted'));
        },
      },
    ]);

  const langLabel = LANGS.find((l) => l.code === currentLang())?.label;

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <T v="h1">{t('account.title')}</T>
        <Card style={{ alignItems: 'center', gap: space.sm }}>
          <Pressable onPress={changePhoto}>
            <Avatar uri={me?.user.photoUrl} name={me?.user.name} size={92} />
            <View style={{ position: 'absolute', bottom: 0, end: 0, backgroundColor: colors.primary, borderRadius: radius.pill, padding: 5, borderWidth: 2, borderColor: colors.white }}>
              <Icon name="camera" size={16} color={colors.white} />
            </View>
          </Pressable>
          <Pressable onPress={() => setEditName(true)}>
            <Row gap={6}>
              <T v="h2">{me?.user.name}</T>
              <Icon name="pencil" size={16} color={colors.muted} />
            </Row>
          </Pressable>
          <T v="caption">{ltr(me?.user.phone)}</T>
          {IS_CAPTAIN && me?.captain ? (
            <T v="small">
              {me.captain.code ? `${t('ride.captainCode')}: ${ltr(String(me.captain.code))} · ` : ''}
              {me.captain.carModel} · {me.captain.carColor} · {ltr(me.captain.plateNumber)}
            </T>
          ) : null}
        </Card>

        <Card style={{ padding: space.sm }}>
          <ListItem icon="web" title={t('account.language')} subtitle={langLabel} onPress={() => setLangOpen(true)} />
          {!IS_CAPTAIN ? (
            <>
              <ListItem icon="bookmark-outline" title={t('places.title')} onPress={() => router.navigate('/(customer)/places')} />
              <ListItem icon="history" title={t('more.myRides')} onPress={() => router.navigate('/(customer)/rides')} />
              <ListItem
                icon="storefront-outline"
                title={t('merchant.title')}
                // حساب التاجر جزء من التوصيل: «قريباً» لحد ما يتفعل التوصيل من الإدارة
                subtitle={!cfg.deliveryEnabled ? t('common.comingSoon') : me?.merchant ? t(`merchant.status.${me.merchant.status}`) : t('merchant.accountHint')}
                onPress={() => (cfg.deliveryEnabled ? router.push('/merchant') : Alert.alert(t('common.comingSoon'), t('common.comingSoonBody')))}
              />
              <ListItem icon="ticket-percent" title={t('account.discounts')} subtitle={t('account.discountsHint')} />
            </>
          ) : (
            <ListItem icon="cash" title={t('captain.earnings.title')} onPress={() => router.navigate('/(captain)/earnings')} />
          )}
          <ListItem icon="headset" title={t('support.title')} onPress={() => router.push('/support')} />
        </Card>

        <Card style={{ padding: space.sm }}>
          <ListItem icon="file-document-outline" title={t('account.terms')} onPress={() => cfg.termsUrl && Linking.openURL(cfg.termsUrl)} />
          <ListItem icon="shield-lock-outline" title={t('account.privacy')} onPress={() => cfg.privacyUrl && Linking.openURL(cfg.privacyUrl)} />
          <ListItem icon="logout" title={t('account.logout')} danger onPress={logout} right={<View />} />
        </Card>

        <Pressable onPress={deleteAccount} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: space.xs }} accessibilityRole="button">
          <T v="small" color={colors.danger}>
            {t('account.deleteAccount')}
          </T>
        </Pressable>

        <T v="small" center>
          {t(IS_CAPTAIN ? 'captainAppName' : 'appName')} · {t('account.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}
        </T>
      </ScrollView>

      <BottomModal visible={langOpen} onClose={() => setLangOpen(false)} title={t('account.language')}>
        <T v="caption">{t('account.languageReload')}</T>
        {LANGS.map((l) => (
          <ListItem
            key={l.code}
            title={l.label}
            onPress={() => changeLang(l.code)}
            right={l.code === currentLang() ? <Icon name="check-circle" color={colors.primary} /> : <View />}
          />
        ))}
      </BottomModal>

      <BottomModal visible={editName} onClose={() => setEditName(false)} title={t('profile.name')}>
        <Input value={name} onChangeText={setName} autoFocus maxLength={60} />
        <Button title={t('common.save')} loading={busy} disabled={name.trim().length < 2} onPress={saveName} />
      </BottomModal>
    </Screen>
  );
}
