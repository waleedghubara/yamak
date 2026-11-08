import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { DocPicker, type DocValue } from '../components/DocPicker';
import { Button, Card, Header, Icon, Input, Pill, Row, Screen, T } from '../components/ui';
import { api } from '../lib/api';
import { showError } from '../lib/device';
import { shortAddress } from '../lib/format';
import type { Point } from '../lib/types';
import { useAuth } from '../state/auth';
import { placeBus, setPendingBooking } from '../state/placeBus';
import { colors, radius, space } from '../theme';

const isTriple = (n: string) => n.trim().split(/\s+/).filter((w) => w.length >= 2).length >= 3;

/**
 * تسجيل التاجر: الاسم الثلاثي، اسم المحل، موقع المحل من الخريطة،
 * الجنسية وجهين، بطاقة السكن وجهين، صورة شخصية ← موافقة الإدارة من لوحة التحكم.
 */
export default function MerchantScreen() {
  const { t } = useTranslation();
  const { me, refreshMe } = useAuth();
  const m = me?.merchant ?? null;
  const [editing, setEditing] = useState(!m || m.status === 'rejected');
  const [fullName, setFullName] = useState(m?.fullName ?? me?.user.name ?? '');
  const [storeName, setStoreName] = useState(m?.storeName ?? '');
  const [location, setLocation] = useState<Point | null>(m?.location ?? null);
  const [docs, setDocs] = useState<Record<string, DocValue | null>>({});
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshMe();
    }, [refreshMe]),
  );

  useEffect(
    () =>
      placeBus.on((target, place) => {
        if (target === 'merchant') setLocation(place);
      }),
    [],
  );

  const keys = ['selfie', 'idFront', 'idBack', 'residenceFront', 'residenceBack'] as const;
  const allDocs = keys.every((k) => docs[k]);
  const valid = isTriple(fullName) && storeName.trim().length >= 2 && !!location && allDocs;

  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/merchant/apply', {
        body: {
          fullName: fullName.trim(),
          storeName: storeName.trim(),
          location,
          documents: Object.fromEntries(keys.map((k) => [k, docs[k]!.id])),
        },
      });
      await refreshMe();
      setEditing(false);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const setDoc = (k: string) => (v: DocValue | null) => setDocs((d) => ({ ...d, [k]: v }));

  if (m && !editing) {
    const approved = m.status === 'approved';
    return (
      <Screen>
        <Header title={t('merchant.title')} onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
          <View style={[styles.statusIcon, approved && { backgroundColor: colors.successSoft }]}>
            <Icon name={approved ? 'storefront-check-outline' : m.status === 'pending' ? 'timer-sand' : 'store-remove-outline'} size={52} color={approved ? colors.success : colors.primary} />
          </View>
          <T v="h1" center>
            {m.storeName}
          </T>
          <Row style={{ justifyContent: 'center' }}>
            <Pill label={t(`merchant.status.${m.status}`)} tone={approved ? 'success' : m.status === 'pending' ? 'warning' : 'danger'} />
          </Row>
          <T v="body" center color={colors.textSoft}>
            {t(`merchant.statusBody.${m.status}`)}
          </T>
          <Card style={{ gap: 6 }}>
            <T v="small">{t('merchant.fullName')}</T>
            <T v="bodyBold">{m.fullName}</T>
            <T v="small">{t('merchant.location')}</T>
            <T v="bodyBold">{shortAddress(m.location)}</T>
          </Card>
          {m.adminNote ? (
            <Card>
              <T v="caption">{m.adminNote}</T>
            </Card>
          ) : null}
          {approved ? (
            <Button
              title={t('merchant.sendOrder')}
              icon="package-variant-closed"
              onPress={() => {
                setPendingBooking({ pickup: { ...m.location, address: m.location.address ?? m.storeName } });
                router.replace({ pathname: '/book', params: { step: 'dropoff', service: 'delivery' } });
              }}
            />
          ) : null}
          <Button title={t('merchant.edit')} kind="ghost" onPress={() => setEditing(true)} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={t('merchant.title')} onBack={() => (m ? setEditing(false) : router.back())} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <T v="caption">{t('merchant.subtitle')}</T>
          <Input label={t('merchant.fullName')} placeholder={t('merchant.fullNamePlaceholder')} value={fullName} onChangeText={setFullName} maxLength={80} />
          {fullName.trim() && !isTriple(fullName) ? (
            <T v="small" color={colors.warning}>
              {t('errors.triple_name_required')}
            </T>
          ) : null}
          <Input label={t('merchant.storeName')} placeholder={t('merchant.storeNamePlaceholder')} value={storeName} onChangeText={setStoreName} maxLength={80} />

          <View style={{ gap: 6 }}>
            <T v="caption">{t('merchant.location')}</T>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/pick-location',
                  params: { target: 'merchant', title: t('merchant.pickLocation'), ...(location ? { lat: String(location.lat), lng: String(location.lng) } : {}) },
                })
              }
              style={[styles.locBox, location && { borderColor: colors.success }]}
            >
              <Icon name="map-marker-radius" color={location ? colors.success : colors.primary} size={26} />
              <T v="bodyBold" style={{ flex: 1 }} numberOfLines={2}>
                {location ? shortAddress(location) : t('merchant.pickLocation')}
              </T>
              <Icon name="chevron-right" flip color={colors.muted} />
            </Pressable>
          </View>

          <T v="h3">{t('merchant.documents')}</T>
          <DocPicker kind="selfie" label={t('docs.selfie')} value={docs.selfie ?? null} onChange={setDoc('selfie')} icon="account-box-outline" height={130} />
          <Row>
            <DocPicker kind="id_front" label={t('docs.nationalFront')} value={docs.idFront ?? null} onChange={setDoc('idFront')} />
            <DocPicker kind="id_back" label={t('docs.nationalBack')} value={docs.idBack ?? null} onChange={setDoc('idBack')} />
          </Row>
          <Row>
            <DocPicker kind="residence_front" label={t('docs.residenceFront')} value={docs.residenceFront ?? null} onChange={setDoc('residenceFront')} icon="home-account" />
            <DocPicker kind="residence_back" label={t('docs.residenceBack')} value={docs.residenceBack ?? null} onChange={setDoc('residenceBack')} icon="home-account" />
          </Row>
          <T v="small">{t('docs.privacy')}</T>
          <Button title={t('merchant.submit')} disabled={!valid} loading={busy} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusIcon: { alignSelf: 'center', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  locBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: space.md, backgroundColor: colors.white },
});
