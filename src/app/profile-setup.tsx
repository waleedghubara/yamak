import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Avatar, Button, Icon, Input, Row, Screen, T } from '../components/ui';
import { IS_CAPTAIN } from '../config';
import { api } from '../lib/api';
import { hasLocationPermission, requestLocationPermission, showError } from '../lib/device';
import type { Me } from '../lib/types';
import { pickAndUploadPhoto, takeAndUploadSelfie } from '../lib/photo';
import { isTriple, validBirthDate } from '../lib/profile';
import { useAuth } from '../state/auth';
import { colors, radius, space } from '../theme';

/**
 * بعد أول تسجيل (أو تسجيل دخول والمعلومات ناقصة):
 *   الزبون: الاسم الثلاثي + تاريخ الميلاد (إلزامي) + صورة اختيارية
 *   الكابتن: الاسم + صورة شخصية من الكاميرا (إلزامية — تطلع للزبون ويا اسمه ورقمه)
 * بعدها صلاحية الموقع.
 */
export default function ProfileSetup() {
  const { t } = useTranslation();
  const { me, setMe } = useAuth();
  const [name, setName] = useState(me?.user.name ?? '');
  const [bd] = useState(() => (me?.user.birthDate ?? '').split('-'));
  const [year, setYear] = useState(bd[0] ?? '');
  const [month, setMonth] = useState(bd[1] ?? '');
  const [day, setDay] = useState(bd[2] ?? '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'profile' | 'location'>('profile');

  const digits = (v: string) => v.replace(/\D/g, '');
  const birthDate = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const dateTyped = !!(year && month && day);
  const dateOk = dateTyped && year.length === 4 && validBirthDate(birthDate);
  const nameOk = IS_CAPTAIN ? name.trim().length >= 2 : isTriple(name);
  const photoOk = !IS_CAPTAIN || !!me?.user.photoUrl;
  const valid = nameOk && photoOk && (IS_CAPTAIN || dateOk);

  const save = async () => {
    setBusy(true);
    try {
      const m = await api<Me>('/api/me', { method: 'PATCH', body: { name: name.trim(), ...(IS_CAPTAIN ? {} : { birthDate }) } });
      setMe(m);
      if (await hasLocationPermission()) router.replace('/');
      else setStep('location');
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const photo = async () => {
    setUploading(true);
    try {
      const m = IS_CAPTAIN ? await takeAndUploadSelfie() : await pickAndUploadPhoto();
      if (m) setMe(m);
    } catch (err) {
      showError(err);
    } finally {
      setUploading(false);
    }
  };

  if (step === 'location') {
    return (
      <Screen style={{ padding: space.xl, justifyContent: 'center', gap: space.xl }}>
        <View style={{ alignSelf: 'center', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="map-marker-radius" size={56} color={colors.primary} />
        </View>
        <T v="h1" center>
          {t('perm.locationTitle')}
        </T>
        <T v="body" center color={colors.textSoft}>
          {IS_CAPTAIN ? t('perm.captainLocationBody') : t('perm.locationBody')}
        </T>
        <Button
          title={t('perm.allow')}
          icon="crosshairs-gps"
          onPress={async () => {
            const ok = await requestLocationPermission();
            if (!ok) Linking.openSettings().catch(() => {});
            router.replace('/');
          }}
        />
        <Button title={t('perm.later')} kind="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const photoLabel = uploading
    ? t('common.loading')
    : IS_CAPTAIN
      ? me?.user.photoUrl
        ? t('profile.changePhoto')
        : t('profile.takeSelfie')
      : `${me?.user.photoUrl ? t('profile.changePhoto') : t('profile.addPhoto')} (${t('common.optional')})`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.xs, marginTop: space.xl }}>
          <T v="h1">{me?.user.name ? t('profile.completeTitle') : t('profile.title')}</T>
          {IS_CAPTAIN ? <T v="caption">{t('profile.selfieRequired')}</T> : null}
        </View>

        <Pressable onPress={photo} style={{ alignSelf: 'center', alignItems: 'center', gap: space.sm }}>
          <View>
            <Avatar uri={me?.user.photoUrl} name={name} size={IS_CAPTAIN ? 120 : 104} />
            <View style={{ position: 'absolute', bottom: 0, end: 0, backgroundColor: colors.primary, borderRadius: radius.pill, padding: 6, borderWidth: 2, borderColor: colors.white }}>
              <Icon name={IS_CAPTAIN ? 'camera-front' : 'camera'} size={18} color={colors.white} />
            </View>
          </View>
          <T v={IS_CAPTAIN && !me?.user.photoUrl ? 'bodyBold' : 'caption'} color={colors.primary}>
            {photoLabel}
          </T>
          {IS_CAPTAIN && !me?.user.photoUrl ? (
            <T v="small" center color={colors.textSoft}>
              {t('profile.selfieTips')}
            </T>
          ) : null}
        </Pressable>

        <View style={{ gap: 4 }}>
          <Input
            label={IS_CAPTAIN ? t('profile.name') : t('profile.tripleName')}
            placeholder={IS_CAPTAIN ? t('profile.namePlaceholder') : t('profile.tripleNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoFocus={!IS_CAPTAIN}
            maxLength={80}
          />
          {!IS_CAPTAIN && name.trim() && !isTriple(name) ? (
            <T v="small" color={colors.warning}>
              {t('errors.triple_name_required')}
            </T>
          ) : null}
        </View>

        {!IS_CAPTAIN ? (
          <View style={{ gap: 6 }}>
            <T v="caption">{t('profile.birthDate')}</T>
            {/* يوم / شهر / سنة — أرقام إنكليزية بالترتيب نفسه بكل اللغات */}
            <Row style={{ direction: 'ltr' }}>
              <Input
                containerStyle={{ flex: 1 }}
                placeholder={t('profile.day')}
                value={day}
                onChangeText={(v) => setDay(digits(v).slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                style={{ textAlign: 'center' }}
              />
              <Input
                containerStyle={{ flex: 1 }}
                placeholder={t('profile.month')}
                value={month}
                onChangeText={(v) => setMonth(digits(v).slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                style={{ textAlign: 'center' }}
              />
              <Input
                containerStyle={{ flex: 1.4 }}
                placeholder={t('profile.year')}
                value={year}
                onChangeText={(v) => setYear(digits(v).slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                style={{ textAlign: 'center' }}
              />
            </Row>
            {dateTyped && year.length === 4 && !dateOk ? (
              <T v="small" color={colors.warning}>
                {t('errors.invalid_birth_date')}
              </T>
            ) : null}
          </View>
        ) : null}

        <Button title={t('profile.continue')} onPress={save} loading={busy} disabled={!valid} />
      </ScrollView>
    </Screen>
  );
}
