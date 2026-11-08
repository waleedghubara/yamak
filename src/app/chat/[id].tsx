import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Chip, Empty, Header, IconButton, Row, Screen, T } from '../../components/ui';
import { IS_CAPTAIN } from '../../config';
import { api } from '../../lib/api';
import { callPhone, showError } from '../../lib/device';
import type { ChatMessage, Ride } from '../../lib/types';
import { useAppConfig } from '../../state/appConfig';
import { useSocketEvent } from '../../state/socket';
import { colors, fonts, radius, space } from '../../theme';
import { isRTL } from '../../lib/rtl';

/** مراسلة داخل التطبيق بين الزبون والكابتن + رسائل جاهزة */
export default function ChatScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const list = useRef<FlatList<ChatMessage>>(null);
  const myRole = IS_CAPTAIN ? 'captain' : 'customer';
  const quick = IS_CAPTAIN ? cfg.lists.quickMessagesCaptain : cfg.lists.quickMessagesCustomer;

  useEffect(() => {
    api<Ride>(`/api/rides/${id}`).then(setRide).catch(() => {});
    api<ChatMessage[]>(`/api/rides/${id}/messages`).then(setMessages).catch(showError);
  }, [id]);

  useSocketEvent<ChatMessage>('chat:message', (m) => {
    if (m.rideId !== id) return;
    setMessages((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
  });

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  const send = async (body: string, quickKey: string | null = null) => {
    if (!body.trim()) return;
    setText('');
    try {
      const m = await api<ChatMessage>(`/api/rides/${id}/messages`, { body: { text: body.trim(), quickKey } });
      setMessages((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
    } catch (err) {
      setText(body);
      showError(err);
    }
  };

  const other = IS_CAPTAIN ? ride?.customer : ride?.captain;

  return (
    <Screen>
      <Header title={other?.name ?? t('chat.title')} right={<IconButton name="phone" bg={colors.primarySoft} color={colors.primary} size={40} onPress={() => callPhone(other?.phone)} />} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          ListEmptyComponent={<Empty icon="message-text" text={t('chat.empty', { name: other?.name ?? '' })} />}
          renderItem={({ item }) => {
            const mine = item.senderRole === myRole;
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  backgroundColor: mine ? colors.primary : colors.white,
                  borderRadius: radius.lg,
                  borderWidth: mine ? 0 : 1,
                  borderColor: colors.border,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                }}
              >
                <T v="body" color={mine ? colors.white : colors.text}>
                  {item.quickKey ? t(`quick.${item.quickKey}`) : item.text}
                </T>
                <T v="small" color={mine ? colors.primaryMuted : colors.muted}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </T>
              </View>
            );
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          {quick.map((k) => (
            <Chip key={k} label={t(`quick.${k}`)} onPress={() => send(t(`quick.${k}`), k)} />
          ))}
        </ScrollView>
        <Row style={{ padding: space.md, paddingTop: 0 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              minHeight: 48,
              maxHeight: 120,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.white,
              paddingHorizontal: space.lg,
              fontFamily: fonts.medium,
              fontSize: 15,
              color: colors.text,
              textAlign: isRTL() ? 'right' : 'left',
            }}
            multiline
            maxLength={500}
          />
          <IconButton name="send" flip bg={colors.primary} color={colors.white} size={48} onPress={() => send(text)} />
        </Row>
      </KeyboardAvoidingView>
    </Screen>
  );
}
