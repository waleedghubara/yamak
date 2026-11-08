import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Empty, Header, Icon, ListItem, Pill, Row, Screen, T } from '../../components/ui';
import { currentLang } from '../../i18n';
import { api } from '../../lib/api';
import { callPhone, openWhatsApp } from '../../lib/device';
import { dateTime, ltr } from '../../lib/format';
import { useAppConfig } from '../../state/appConfig';
import { colors, space } from '../../theme';

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  rideId: string | null;
  updatedAt: string;
  lastMessage: string | null;
}

/** المساعدة والدعم: أسئلة شائعة + مراسلة الدعم */
export default function SupportScreen() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const [faq, setFaq] = useState<{ q: string; a: string }[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    api<{ q: string; a: string }[]>('/api/content/faq', { query: { lang: currentLang() } })
      .then(setFaq)
      .catch(() => {});
  }, []);
  useFocusEffect(
    useCallback(() => {
      api<Ticket[]>('/api/support/tickets').then(setTickets).catch(() => {});
    }, []),
  );

  return (
    <Screen>
      <Header title={t('support.title')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Row>
          <Button title={t('support.newTicket')} icon="message-text" style={{ flex: 1 }} onPress={() => router.push('/support/new')} />
          {cfg.supportPhone ? <Button title={t('support.callSupport')} kind="secondary" icon="phone" onPress={() => callPhone(cfg.supportPhone)} /> : null}
        </Row>
        {cfg.supportPhone ? (
          <>
            <Button title={t('support.whatsapp')} kind="secondary" icon="whatsapp" onPress={() => openWhatsApp(cfg.supportPhone)} />
            <T v="caption" center>
              {t('support.number')}: {ltr(cfg.supportPhone)}
            </T>
          </>
        ) : null}

        <T v="h3">{t('support.myTickets')}</T>
        {tickets.length ? (
          <Card style={{ padding: space.sm }}>
            {tickets.map((tk) => (
              <ListItem
                key={tk.id}
                icon="message-text"
                title={t(`support.topics.${tk.subject}`, { defaultValue: tk.subject })}
                subtitle={`${dateTime(tk.updatedAt)} · ${tk.lastMessage ?? ''}`}
                onPress={() => router.push(`/support/${tk.id}`)}
                right={<Pill label={t(`support.ticketStatus.${tk.status}`)} tone={tk.status === 'answered' ? 'success' : tk.status === 'open' ? 'warning' : 'muted'} />}
              />
            ))}
          </Card>
        ) : (
          <Empty icon="message-text" text={t('support.noTickets')} />
        )}

        <T v="h3">{t('support.faq')}</T>
        <Card style={{ padding: space.sm }}>
          {faq.map((f, i) => (
            <Pressable key={i} onPress={() => setOpen(open === i ? null : i)} style={{ padding: space.md, gap: space.xs }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="bodyBold" style={{ flex: 1 }}>
                  {f.q}
                </T>
                <Icon name={open === i ? 'minus' : 'plus'} color={colors.primary} size={18} />
              </Row>
              {open === i ? <T v="body" color={colors.textSoft}>{f.a}</T> : null}
            </Pressable>
          ))}
        </Card>
        <View style={{ height: space.xl }} />
      </ScrollView>
    </Screen>
  );
}
