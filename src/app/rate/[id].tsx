import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Avatar, Button, Chip, Input, Loading, Screen, Stars, T } from '../../components/ui';
import { api } from '../../lib/api';
import { showError } from '../../lib/device';
import type { Ride } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { space } from '../../theme';

/** كيف كانت رحلتك؟ نجوم + خيارات + تعليق */
export default function RateScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Ride>(`/api/rides/${id}`).then(setRide).catch(showError);
  }, [id]);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/(customer)/home'));

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/rides/${id}/rate`, { body: { stars, tags, comment: comment.trim() || null } });
      Alert.alert('', t('rate.thanks'));
      done();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!ride) return <Loading />;
  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Avatar uri={ride.captain?.photoUrl} name={ride.captain?.name} size={88} />
            <T v="h2">{ride.captain?.name}</T>
            <T v="caption">
              {ride.captain?.carModel} · {ride.captain?.carColor}
            </T>
          </View>
          <T v="h1" center>
            {t('rate.title')}
          </T>
          <Stars value={stars} onChange={setStars} size={44} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' }}>
            {cfg.lists.ratingTags.map((tag) => (
              <Chip
                key={tag}
                label={t(`tags.${tag}`)}
                selected={tags.includes(tag)}
                onPress={() => setTags((x) => (x.includes(tag) ? x.filter((y) => y !== tag) : [...x, tag]))}
              />
            ))}
          </View>
          <Input
            placeholder={`${t('rate.commentPlaceholder')} (${t('common.optional')})`}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
          />
          <Button title={t('rate.submit')} disabled={!stars} loading={busy} onPress={submit} />
          <Button title={t('rate.skip')} kind="ghost" onPress={done} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
