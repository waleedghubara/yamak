import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow, space } from '../theme';
import { isRTL } from '../lib/rtl';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color = colors.text, flip }: { name: IconName; size?: number; color?: string; flip?: boolean }) {
  // flip: السهم ينقلب بالعربي والكردي (من اليمين لليسار). نستخدم arrow-left للرجوع و chevron-right للتقدم
  const style = flip && isRTL() ? { transform: [{ scaleX: -1 }] } : undefined;
  return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
}

// ───────── النصوص ─────────

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'bodyBold' | 'caption' | 'small' | 'logo';
const variants: Record<Variant, TextStyle> = {
  logo: { fontFamily: fonts.black, fontSize: 40, color: colors.primary, lineHeight: 56 },
  h1: { fontFamily: fonts.heavy, fontSize: 24, lineHeight: 36 },
  h2: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 30 },
  h3: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.muted },
  small: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: colors.muted },
};

export function T({ v = 'body', style, color, center, ...rest }: TextProps & { v?: Variant; color?: string; center?: boolean }) {
  return (
    <Text
      {...rest}
      style={[{ color: colors.text, textAlign: center ? 'center' : undefined }, variants[v], color ? { color } : null, style]}
    />
  );
}

// ───────── الأزرار ─────────

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'white';
const btnColors: Record<BtnKind, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.white },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark },
  ghost: { bg: 'transparent', fg: colors.textSoft, border: colors.border },
  danger: { bg: colors.danger, fg: colors.white },
  success: { bg: colors.success, fg: colors.white },
  white: { bg: colors.white, fg: colors.primaryDark, border: colors.border },
};

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  icon,
  style,
  small,
  onLongPress,
  delayLongPress,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  onLongPress?: () => void;
  delayLongPress?: number;
}) {
  const c = btnColors[kind];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      onLongPress={off ? undefined : onLongPress}
      delayLongPress={delayLongPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: c.bg, borderColor: c.border ?? c.bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 18 : 20} color={c.fg} /> : null}
          <T v={small ? 'small' : 'bodyBold'} color={c.fg} style={small ? { fontFamily: fonts.bold } : undefined}>
            {title}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  color = colors.text,
  bg = colors.white,
  size = 44,
  label,
  style,
  flip,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
  flip?: boolean;
}) {
  return (
    <View style={[{ alignItems: 'center', gap: 4 }, style]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
          bg === colors.white && shadow,
          pressed && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Icon name={name} color={color} size={size * 0.48} flip={flip} />
      </Pressable>
      {label ? <T v="small">{label}</T> : null}
    </View>
  );
}

// ───────── الحاويات ─────────

export function Screen({ children, style, edges = ['top', 'bottom'] }: { children: ReactNode; style?: StyleProp<ViewStyle>; edges?: ('top' | 'bottom')[] }) {
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.bg }, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function Header({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack ?? (() => router.back())} hitSlop={12} style={styles.backBtn} accessibilityLabel="back">
        <Icon name="arrow-left" flip size={24} />
      </Pressable>
      <T v="h3" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </T>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.9 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.divider, marginVertical: space.sm }, style]} />;
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? colors.white : colors.primary} /> : null}
      <T v="small" color={selected ? colors.white : colors.textSoft} style={{ fontFamily: fonts.bold }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Pill({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'success' | 'danger' | 'warning' | 'muted' }) {
  const map = {
    primary: [colors.primarySoft, colors.primaryDark],
    success: [colors.successSoft, colors.success],
    danger: [colors.dangerSoft, colors.danger],
    warning: [colors.warningSoft, colors.warning],
    muted: ['#F0EEF4', colors.muted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <T v="small" color={fg} style={{ fontFamily: fonts.bold }}>
        {label}
      </T>
    </View>
  );
}

export function Input(props: TextInputProps & { label?: string; containerStyle?: StyleProp<ViewStyle> }) {
  const { label, containerStyle, style, ...rest } = props;
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? <T v="caption">{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        {...rest}
        style={[styles.input, { textAlign: isRTL() ? 'right' : 'left' }, style]}
      />
    </View>
  );
}

export function Avatar({ uri, name, size = 52 }: { uri?: string | null; name?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <T v="h3" color={colors.primary}>
        {(name ?? '؟').trim().charAt(0)}
      </T>
    </View>
  );
}

export function Stars({ value, size = 32, onChange, color = colors.primary }: { value: number; size?: number; onChange?: (n: number) => void; color?: string }) {
  return (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={onChange ? () => onChange(n) : undefined} hitSlop={6}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={size} color={color} />
        </Pressable>
      ))}
    </Row>
  );
}

export function Rating({ value, count }: { value: number | null; count?: number }) {
  if (value == null) return null;
  return (
    <Row gap={3}>
      <Icon name="star" size={15} color={colors.star} />
      <T v="small" color={colors.textSoft} style={{ fontFamily: fonts.bold }}>
        {value.toFixed(1)}
        {count ? ` (${count})` : ''}
      </T>
    </Row>
  );
}

/** لوحة سفلية فوق الخريطة */
export function Sheet({ children, style, scroll }: { children: ReactNode; style?: StyleProp<ViewStyle>; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const inner = scroll ? (
    <ScrollView contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    children
  );
  return <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }, style]}>{inner}</View>;
}

/** نافذة من الأسفل (أسباب الإلغاء، الطوارئ، البلاغ...) */
export function BottomModal({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
      <View style={[styles.modal, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        <View style={styles.grabber} />
        {title ? (
          <T v="h2" style={{ marginBottom: space.sm }}>
            {title}
          </T>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ListItem({
  icon,
  title,
  subtitle,
  onPress,
  right,
  danger,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.listItem, pressed && onPress && { backgroundColor: colors.primarySoft }]}>
      {icon ? (
        <View style={styles.listIcon}>
          <Icon name={icon} size={20} color={danger ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T v="bodyBold" color={danger ? colors.danger : undefined} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T v="caption" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" flip color={colors.muted} /> : null)}
    </Pressable>
  );
}

export function Empty({ icon = 'information-outline', text }: { icon?: IconName; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <Icon name={icon} size={44} color={colors.primaryMuted} />
      <T v="caption" center>
        {text}
      </T>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: {
    minHeight: 54,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
  },
  btnSmall: { minHeight: 38, borderRadius: radius.sm, paddingHorizontal: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, ...shadow, shadowOpacity: 0.06 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space.lg,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.md,
    ...shadow,
  },
  modal: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: '85%',
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.md },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  listIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
