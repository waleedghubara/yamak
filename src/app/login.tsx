import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { BottomModal, Button, Icon, Input, Row, Screen, T } from '../components/ui';
import { IS_CAPTAIN } from '../config';
import { api } from '../lib/api';
import { errorText } from '../lib/device';
import { getBaseUrl, pingServer, SERVER_SWITCH_ENABLED, setBaseUrl } from '../lib/server';
import { useAppConfig } from '../state/appConfig';
import { colors, fonts, radius, space } from '../theme';

/** تسجيل الدخول برقم الهاتف فقط (بدون إيميل ولا كلمة سر) */
export default function LoginScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverOpen, setServerOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(getBaseUrl());
  const [testing, setTesting] = useState(false);

  const testAndSave = async () => {
    setTesting(true);
    const ok = await pingServer(serverUrl);
    setTesting(false);
    if (ok) {
      await setBaseUrl(serverUrl);
      setServerOpen(false);
      Alert.alert('', t('server.ok'));
    } else {
      Alert.alert('', t('server.fail'));
    }
  };

  const digits = phone.replace(/\D/g, '');
  const valid = /^0?7\d{9}$/.test(digits);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ phone: string; devCode?: string; resendInSec: number }>('/api/auth/otp/request', {
        body: { phone: digits },
      });
      router.push({ pathname: '/verify', params: { phone: r.phone, devCode: r.devCode ?? '', resendIn: String(r.resendInSec) } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.xl }}>
        {/* ضغطة مطولة على الشعار: تغيير عنوان السيرفر (للتجربة) */}
        <Pressable onLongPress={SERVER_SWITCH_ENABLED ? () => setServerOpen(true) : undefined} delayLongPress={1500} style={{ alignItems: 'center', gap: space.xs }}>
          <T v="logo" style={{ fontSize: 64, lineHeight: 90 }}>
            {t('appName')}
          </T>
          <T v="caption">{IS_CAPTAIN ? t('captainAppName') : t('tagline')}</T>
        </Pressable>

        <View style={{ gap: space.sm }}>
          <T v="h2">{t('auth.welcome')}</T>
          <T v="caption">{t(cfg.otpChannel === 'whatsapp' ? 'auth.phoneHintWhatsapp' : 'auth.phoneHint')}</T>
        </View>

        <View style={{ gap: space.sm }}>
          <T v="caption">{t('auth.phoneTitle')}</T>
          {/* الرقم دائماً من اليسار لليمين */}
          <Row
            style={{
              direction: 'ltr',
              borderWidth: 1,
              borderColor: error ? colors.danger : colors.border,
              backgroundColor: colors.white,
              borderRadius: radius.md,
              paddingHorizontal: space.lg,
              minHeight: 58,
            }}
          >
            <Icon name="phone" color={colors.primary} />
            <T style={{ fontFamily: fonts.bold, color: colors.muted }}>+964</T>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              autoFocus
              maxLength={14}
              style={{ flex: 1, fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'left', letterSpacing: 1 }}
              onSubmitEditing={valid ? send : undefined}
            />
          </Row>
          {error ? (
            <T v="caption" color={colors.danger}>
              {error}
            </T>
          ) : null}
        </View>

        <Button title={t('auth.sendCode')} onPress={send} disabled={!valid} loading={busy} />
        <T v="small" center>
          {t('auth.terms')}
        </T>
      </KeyboardAvoidingView>

      <BottomModal visible={serverOpen} onClose={() => setServerOpen(false)} title={t('server.title')}>
        <T v="caption">{t('server.hint')}</T>
        <Input
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ textAlign: 'left' }}
        />
        <Button title={t('server.test')} icon="web" loading={testing} onPress={testAndSave} />
        <Button
          title={t('server.reset')}
          kind="ghost"
          onPress={async () => {
            await setBaseUrl(null);
            setServerUrl(getBaseUrl());
          }}
        />
      </BottomModal>
    </Screen>
  );
}
