import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { showError } from '../lib/device';
import { pickAndUploadDocument, type DocKind } from '../lib/photo';
import { colors, fonts, radius, space } from '../theme';
import { Icon, T, type IconName } from './ui';

export interface DocValue {
  id: string;
  uri: string;
}

/**
 * مربع رفع صورة مستمسك: يصور بالكاميرا أو يختار من الصور، يرفعها، ويعرض المصغرة.
 */
export function DocPicker({
  kind,
  label,
  value,
  onChange,
  icon = 'card-account-details-outline',
  height = 110,
  style,
}: {
  kind: DocKind;
  label: string;
  value: DocValue | null;
  onChange: (v: DocValue | null) => void;
  icon?: IconName;
  height?: number;
  style?: object;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await pickAndUploadDocument(kind);
      if (r) onChange(r);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={pick} style={({ pressed }) => [styles.box, { height }, value && styles.done, pressed && { opacity: 0.8 }, style]}>
      {value ? <Image source={{ uri: value.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      <View style={styles.center}>
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : value ? null : (
          <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingBottom: 14 }}>
            <Icon name={icon} size={28} color={colors.primary} />
            <Icon name="camera-plus" size={16} color={colors.muted} />
          </View>
        )}
      </View>
      {value && !busy ? (
        <View style={styles.check}>
          <Icon name="check" size={14} color={colors.white} />
        </View>
      ) : null}
      <View style={[styles.labelBar, value ? styles.labelBarDone : null]}>
        <T numberOfLines={1} style={[styles.label, value ? { color: colors.white } : null]}>
          {label}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  done: { borderStyle: 'solid', borderColor: colors.success },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: 6, start: 6, backgroundColor: colors.success, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  labelBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 3, paddingHorizontal: space.xs, alignItems: 'center' },
  labelBarDone: { backgroundColor: 'rgba(18,161,80,0.85)' },
  label: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 17, color: colors.primaryDark },
});
