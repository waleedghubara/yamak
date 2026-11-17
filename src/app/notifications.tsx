import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { Card, Empty, Header, Icon, Row, Screen, T } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { colors, space } from '../theme';

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface Inbox {
  items: InboxItem[];
  unread: number;
}

/** خانة «الإشعارات»: كل عروض وتبليغات الإدارة — تطلع هنا حتى لو إشعار الـ push ما وصل للجهاز */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Inbox>('/api/me/notifications');
      setInbox(r);
      // غير المقروءة تنعلم «جديد» بهالزيارة، وبعدها تنحسب مقروءة
      setNewIds(new Set(r.items.slice(0, r.unread).map((n) => n.id)));
      if (r.unread > 0) api('/api/me/notifications/seen', { body: {} }).catch(() => {});
    } catch {
      setInbox((v) => v ?? { items: [], unread: 0 });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <Header title={t('notifications.title')} />
      {!inbox ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          {inbox.items.length === 0 ? (
            <Empty icon="bell-outline" text={`${t('notifications.empty')}\n${t('notifications.hint')}`} />
          ) : (
            inbox.items.map((n) => (
              <Card key={n.id} style={newIds.has(n.id) ? { borderWidth: 1.5, borderColor: colors.primary } : undefined}>
                <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                  <View style={{ paddingTop: 2 }}>
                    <Icon name={newIds.has(n.id) ? 'bell-ring' : 'bell-outline'} color={colors.primary} size={22} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <T v="bodyBold">{n.title}</T>
                    <T v="body" color={colors.textSoft}>
                      {n.body}
                    </T>
                    <T v="small" color={colors.muted}>
                      {dateTime(n.createdAt)}
                    </T>
                  </View>
                </Row>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
