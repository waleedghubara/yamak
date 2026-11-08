import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button, Icon, Screen, T } from '../components/ui';
import { currentLang, LANGS, setLanguage } from '../i18n';
import type { Lang } from '../lib/types';
import { boot } from '../state/boot';
import { colors, fonts, radius, space } from '../theme';

/** أول تشغيل: اختيار اللغة (عربي، كردي، تركماني) */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Lang>(currentLang());
  const [busy, setBusy] = useState(false);

  const done = async () => {
    setBusy(true);
    boot.langChosen = true;
    await setLanguage(lang); // إذا تغير الاتجاه التطبيق يعيد التشغيل تلقائياً
    setBusy(false);
    router.replace('/');
  };

  return (
    <Screen style={{ padding: space.xl, justifyContent: 'center', gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <T v="logo" style={{ fontSize: 64, lineHeight: 90 }}>
          {t('appName')}
        </T>
        <T v="caption">{t('tagline')}</T>
      </View>
      <View style={{ gap: space.sm }}>
        <T v="h2" center>
          {t('language.title')}
        </T>
        <T v="caption" center>
          {t('language.subtitle')}
        </T>
      </View>
      <View style={{ gap: space.md }}>
        {LANGS.map((l) => {
          const selected = l.code === lang;
          return (
            <Pressable
              key={l.code}
              onPress={() => setLang(l.code)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: space.lg,
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primarySoft : colors.white,
              }}
            >
              <T style={{ fontFamily: fonts.bold, fontSize: 18 }}>{l.label}</T>
              <Icon name={selected ? 'check-circle' : 'circle-medium'} color={selected ? colors.primary : colors.border} />
            </Pressable>
          );
        })}
      </View>
      <Button title={t('common.next')} onPress={done} loading={busy} />
    </Screen>
  );
}
