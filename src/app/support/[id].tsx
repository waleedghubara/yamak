import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Header, Input, Pill, Row, Screen, T } from '../../components/ui';
import { api } from '../../lib/api';
import { showError } from '../../lib/device';
import { dateTime } from '../../lib/format';
import { useSocketEvent } from '../../state/socket';
import { colors, radius, space } from '../../theme';

interface Thread {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  rideId: string | null;
  messages: { id: number; fromAdmin: boolean; text: string; createdAt: string }[];
}

export default function TicketScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Thread>(`/api/support/tickets/${id}`).then(setThread).catch(showError);
  }, [id]);
  useEffect(load, [load]);
  useSocketEvent<{ ticketId: string }>('support:reply', (d) => d.ticketId === id && load());

  const send = async () => {
    setBusy(true);
    try {
      await api(`/api/support/tickets/${id}/messages`, { body: { text: text.trim() } });
      setText('');
      load();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header
        title={thread ? t(`support.topics.${thread.subject}`, { defaultValue: thread.subject }) : ''}
        right={thread ? <Pill label={t(`support.ticketStatus.${thread.status}`)} tone={thread.status === 'answered' ? 'success' : 'warning'} /> : null}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={thread?.messages ?? []}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          ListHeaderComponent={thread?.rideId ? <Pill label={t('support.rideLinked', { id: thread.rideId.slice(0, 8) })} /> : null}
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.fromAdmin ? 'flex-start' : 'flex-end',
                maxWidth: '85%',
                backgroundColor: item.fromAdmin ? colors.white : colors.primarySoft,
                borderColor: colors.border,
                borderWidth: item.fromAdmin ? 1 : 0,
                borderRadius: radius.lg,
                padding: space.md,
                gap: 2,
              }}
            >
              {item.fromAdmin ? (
                <T v="small" color={colors.primary}>
                  {t('support.supportTeam')}
                </T>
              ) : null}
              <T v="body">{item.text}</T>
              <T v="small">{dateTime(item.createdAt)}</T>
            </View>
          )}
        />
        {thread && thread.status !== 'closed' ? (
          <Row style={{ padding: space.md }}>
            <Input containerStyle={{ flex: 1 }} placeholder={t('support.replyPlaceholder')} value={text} onChangeText={setText} multiline />
            <Button small style={{ minHeight: 52 }} title={t('common.send')} loading={busy} disabled={!text.trim()} onPress={send} />
          </Row>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
