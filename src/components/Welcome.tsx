import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet } from 'react-native';
import { T } from './ui';
import { IS_CAPTAIN } from '../config';
import { colors, space } from '../theme';

/**
 * ترحيب قصير عند فتح التطبيق: اللوقو يكبر ويبان، وتحته كلمة ترحيب، وبعدها تختفي الشاشة.
 * نص وحركة فقط — بدون أي صورة أو طلب من السيرفر، فما يثقل التطبيق ولا الإقلاع.
 * تطلع مرة وحدة بكل تشغيل للتطبيق (مو مع كل تنقل بين الشاشات).
 */
let played = false;
const SHOW_MS = 900;

export function Welcome({ name }: { name?: string | null }) {
  const { t } = useTranslation();
  const [gone, setGone] = useState(played);
  const [logo] = useState(() => new Animated.Value(0));
  const [hello] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (played) return;
    played = true;
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 9 }),
      Animated.timing(hello, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.delay(SHOW_MS),
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(() => setGone(true));
  }, [logo, hello, fade]);

  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity: fade }]}>
      <Animated.View
        style={{
          opacity: logo,
          transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }],
        }}
      >
        <T v="logo" center style={{ fontSize: 46, lineHeight: 66, color: colors.white }}>
          {t(IS_CAPTAIN ? 'captainAppName' : 'appName')}
        </T>
      </Animated.View>
      <Animated.View style={{ opacity: hello, transform: [{ translateY: hello.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <T v="body" center style={{ color: colors.white, opacity: 0.9 }}>
          {name ? t('home.helloName', { name: name.split(' ')[0] }) : t('home.hello')}
        </T>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    zIndex: 10,
  },
});
