import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Chip, Header, Input, Pill, Screen, T } from '../../components/ui';
import { api } from '../../lib/api';
import { showError } from '../../lib/device';
import { useAppConfig } from '../../state/appConfig';
import { space } from '../../theme';

/** مراسلة الدعم. إذا جاي من رحلة، رقم الرحلة ينرسل تلقائياً */
export default function NewTicket() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const [topic, setTopic] = useState<string>(rideId ? 'ride_issue' : '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/api/support/tickets', { body: { topic, message: message.trim(), rideId: rideId || null } });
      Alert.alert('', t('support.sent'));
      router.replace(`/support/${r.id}`);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={t('support.newTicket')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          {rideId ? <Pill label={t('support.rideLinked', { id: rideId.slice(0, 8) })} /> : null}
          <T v="caption">{t('support.topic')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {cfg.lists.supportTopics.map((k) => (
              <Chip key={k} label={t(`support.topics.${k}`)} selected={topic === k} onPress={() => setTopic(k)} />
            ))}
          </View>
          <Input
            label={t('support.message')}
            placeholder={t('support.messagePlaceholder')}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
            style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: 12 }}
          />
          <Button title={t('common.send')} loading={busy} disabled={!topic || message.trim().length < 2} onPress={send} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
