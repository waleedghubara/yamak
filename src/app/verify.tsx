import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { Button, Header, Screen, T } from '../components/ui';
import { currentLang } from '../i18n';
import { api } from '../lib/api';
import { errorText } from '../lib/device';
import { ltr } from '../lib/format';
import type { Me } from '../lib/types';
import { useAppConfig } from '../state/appConfig';
import { useAuth } from '../state/auth';
import { colors, fonts, radius, space } from '../theme';

const LEN = 6;

export default function VerifyScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ phone: string; devCode?: string; resendIn?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState(params.devCode || '');
  const [wait, setWait] = useState(Number(params.resendIn ?? 60));
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const verify = async (c = code) => {
    if (c.length !== LEN || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Me & { token: string; isNew: boolean }>('/api/auth/otp/verify', {
        body: { phone: params.phone, code: c, lang: currentLang() },
      });
      await signIn(r.token, { user: r.user, captain: r.captain });
      router.replace(r.user.name ? '/' : '/profile-setup');
    } catch (err) {
      setError(errorText(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const r = await api<{ devCode?: string; resendInSec: number }>('/api/auth/otp/request', { body: { phone: params.phone } });
      setDevCode(r.devCode ?? '');
      setWait(r.resendInSec);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Screen>
      <Header />
      <View style={{ padding: space.xl, gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T v="h1">{t('auth.codeTitle')}</T>
          <T v="caption">{t(cfg.otpChannel === 'whatsapp' ? 'auth.codeSentToWhatsapp' : 'auth.codeSentTo', { phone: ltr(params.phone) })}</T>
          {devCode ? (
            <T v="small" color={colors.warning}>
              {t('auth.devCode', { code: devCode })}
            </T>
          ) : null}
        </View>

        <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, direction: 'ltr' }}>
          {Array.from({ length: LEN }).map((_, i) => (
            <View
              key={i}
              style={{
                width: 46,
                height: 56,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: code.length === i ? colors.primary : error ? colors.danger : colors.border,
                backgroundColor: colors.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <T style={{ fontFamily: fonts.heavy, fontSize: 24 }}>{code[i] ?? ''}</T>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(v) => {
            const c = v.replace(/\D/g, '').slice(0, LEN);
            setCode(c);
            if (c.length === LEN) verify(c);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={LEN}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
        />
        {error ? (
          <T v="caption" color={colors.danger} center>
            {error}
          </T>
        ) : null}

        <Button title={t('auth.verify')} onPress={() => verify()} disabled={code.length !== LEN} loading={busy} />
        <View style={{ alignItems: 'center', gap: space.md }}>
          {wait > 0 ? (
            <T v="caption">{t('auth.resendIn', { sec: wait })}</T>
          ) : (
            <Pressable onPress={resend}>
              <T v="bodyBold" color={colors.primary}>
                {t('auth.resend')}
              </T>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()}>
            <T v="caption" color={colors.textSoft}>
              {t('auth.changePhone')}
            </T>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
