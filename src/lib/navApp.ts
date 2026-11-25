import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import i18n from '../i18n';
import type { Point } from './types';

/**
 * «افتح بتطبيق ملاحة»: المستخدم يختار التطبيق كل مرة (ماكو تطبيق افتراضي ثابت).
 *   أندرويد: رابط geo: ← منتقي النظام يعرض كل تطبيقات الملاحة المثبتة.
 *   آيفون: نفحص المخططات المتاحة (canOpenURL) ونعرض ActionSheet بالتطبيقات الموجودة.
 */
interface NavOption {
  key: string;
  label: string;
  url: string;
}

function iosOptions(p: Point): NavOption[] {
  const ll = `${p.lat},${p.lng}`;
  return [
    { key: 'apple', label: 'Apple Maps', url: `maps://?daddr=${ll}&dirflg=d` },
    { key: 'google', label: 'Google Maps', url: `comgooglemaps://?daddr=${ll}&directionsmode=driving` },
    { key: 'waze', label: 'Waze', url: `waze://?ll=${ll}&navigate=yes` },
  ];
}

export async function openNavApp(dest: Point, label?: string): Promise<void> {
  const t = i18n.t.bind(i18n);
  const name = label || dest.address || '';

  if (Platform.OS === 'android') {
    // منتقي النظام يطلع وحده إذا أكو أكثر من تطبيق ملاحة
    const url = `geo:${dest.lat},${dest.lng}?q=${dest.lat},${dest.lng}${name ? `(${encodeURIComponent(name)})` : ''}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('', t('nav.noApp'));
    }
    return;
  }

  const available: NavOption[] = [];
  for (const o of iosOptions(dest)) {
    try {
      if (await Linking.canOpenURL(o.url)) available.push(o);
    } catch {
      // المخطط غير معلن: نتجاوزه
    }
  }
  if (!available.length) {
    Alert.alert('', t('nav.noApp'));
    return;
  }
  if (available.length === 1) {
    Linking.openURL(available[0].url).catch(() => Alert.alert('', t('nav.noApp')));
    return;
  }
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: t('nav.chooseApp'),
      options: [...available.map((o) => o.label), t('common.cancel')],
      cancelButtonIndex: available.length,
    },
    (i) => {
      const chosen = available[i];
      if (chosen) Linking.openURL(chosen.url).catch(() => Alert.alert('', t('nav.noApp')));
    },
  );
}
