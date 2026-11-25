import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { IS_CAPTAIN } from '../config';
import { useAuth } from '../state/auth';
import { colors, radius, shadow } from '../theme';
import { Avatar } from './ui';

/**
 * زاوية «حسابي»: دائرة صغيرة واضحة بأعلى كل شاشة — تفتح حسابي
 * (الدعم، اللغة، الوضع الليلي، الأماكن، رحلاتي، الشروط، تسجيل الخروج...)
 */
export function AccountCircle({ size = 40, dot }: { size?: number; dot?: boolean }) {
  const { me } = useAuth();
  return (
    <Pressable
      onPress={() => router.navigate(IS_CAPTAIN ? '/(captain)/account' : '/(customer)/account')}
      hitSlop={8}
      accessibilityRole="button"
      style={{ borderRadius: radius.pill, backgroundColor: colors.card, padding: 2, ...shadow, shadowOpacity: 0.08 }}
    >
      <Avatar uri={me?.user.photoUrl} name={me?.user.name} size={size} />
      {dot ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            end: 0,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.danger,
            borderWidth: 2,
            borderColor: colors.card,
          }}
        />
      ) : null}
    </Pressable>
  );
}
