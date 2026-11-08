/**
 * هوية يمك — كل الألوان والخطوط بمكان واحد.
 * الألوان مأخوذة من تصميم الهوية المعتمد (البنفسجي).
 */
export const colors = {
  primary: '#6323AF',
  primaryDark: '#4B0A8C',
  primaryLight: '#9846DE',
  primarySoft: '#F1EAFB',
  primaryMuted: '#D9C0F5',
  bg: '#FAFAFE',
  card: '#FFFFFF',
  text: '#1C1530',
  textSoft: '#4A4160',
  muted: '#7A7290',
  border: '#ECE6F5',
  divider: '#F3EFF9',
  star: '#F5B301',
  success: '#12A150',
  successSoft: '#E7F7EE',
  danger: '#D92D4B',
  dangerSoft: '#FDECEF',
  warning: '#C27C00',
  warningSoft: '#FFF4DC',
  white: '#FFFFFF',
  overlay: 'rgba(28, 21, 48, 0.45)',
} as const;

export const fonts = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  bold: 'Vazirmatn_700Bold',
  heavy: 'Vazirmatn_800ExtraBold',
  black: 'Vazirmatn_900Black',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const shadow = {
  shadowColor: '#2A0C4A',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const;
