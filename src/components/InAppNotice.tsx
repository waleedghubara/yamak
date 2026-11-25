import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_CAPTAIN } from '../config';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import { useAuth } from '../state/auth';
import { usePatchAppConfig } from '../state/appConfig';
import { useSocketEvent } from '../state/socket';
import { colors, radius, shadow, space } from '../theme';
import { Icon, Row, T } from './ui';

interface Notice {
  id: string;
  title: string;
  body: string;
  audience?: 'customers' | 'captains' | 'all';
}

const LAST_SHOWN_KEY = 'yamak_last_notice';
const SHOW_MS = 6000;

/** هل الإشعار يخص هذا التطبيق؟ (زبائن / كباتن / الكل) */
function forThisApp(a: Notice['audience']) {
  return !a || a === 'all' || a === (IS_CAPTAIN ? 'captains' : 'customers');
}

/**
 * إشعارات الإدارة داخل التطبيق: تنبثق بشكل بسيط بأعلى الشاشة (وتنحفظ بخانة «الإشعارات»)
 *   - التطبيق مفتوح: توصل فوراً من السيرفر
 *   - التطبيق كان مسدود: أول ما ينفتح يطلع آخر إشعار ما شافه
 * + يسمع زر الإدارة (تشغيل/إيقاف طلبات الزبائن) ويحدثه فوراً
 */
export function InAppNotice() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const patchConfig = usePatchAppConfig();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [slide] = useState(() => new Animated.Value(-200));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(slide, { toValue: -200, duration: 220, useNativeDriver: true }).start(() => setNotice(null));
  }, [slide]);

  const show = useCallback(
    (n: Notice) => {
      if (timer.current) clearTimeout(timer.current);
      setNotice(n);
      storage.set(LAST_SHOWN_KEY, n.id);
      slide.setValue(-200);
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(hide, SHOW_MS);
    },
    [slide, hide],
  );

  // التطبيق انفتح أو رجع من الخلفية: آخر إشعار جديد ما انعرض
  const checkInbox = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api<{ items: Notice[]; unread: number }>('/api/me/notifications');
      const newest = r.unread > 0 ? r.items[0] : null;
      if (!newest) return;
      const last = await storage.get(LAST_SHOWN_KEY);
      if (last !== newest.id) show(newest);
    } catch {
      // ignore
    }
  }, [token, show]);

  useEffect(() => {
    // الفحص الأول بعد الرندر (مو داخل جسم الإيفكت) حتى ما يصير رندر متسلسل
    const id = setTimeout(checkInbox, 0);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && checkInbox());
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, [checkInbox]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useSocketEvent<Notice & { createdAt?: string }>('notification:new', (n) => {
    if (n?.id && forThisApp(n.audience)) show(n);
  });
  useSocketEvent<{ ridesEnabled: boolean }>('config:rides', (d) => {
    if (typeof d?.ridesEnabled === 'boolean') patchConfig({ ridesEnabled: d.ridesEnabled });
  });

  if (!notice) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + space.sm, transform: [{ translateY: slide }] }]}>
      <Pressable
        style={styles.card}
        onPress={() => {
          hide();
          router.push('/notifications');
        }}
      >
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <View style={styles.icon}>
            <Icon name="bell-ring" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="bodyBold" color={colors.white} numberOfLines={1}>
              {notice.title}
            </T>
            <T v="small" color={colors.primaryMuted} numberOfLines={2}>
              {notice.body}
            </T>
          </View>
          <Pressable hitSlop={12} onPress={hide}>
            <Icon name="close" size={18} color={colors.primaryMuted} />
          </Pressable>
        </Row>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, zIndex: 2000, elevation: 20 },
  card: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: space.md, ...shadow },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
