import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { Empty, Icon, ListItem, Row, Screen, T } from '../components/ui';
import { api } from '../lib/api';
import type { PlaceResult, SavedPlace } from '../lib/types';
import { placeBus } from '../state/placeBus';
import { colors, fonts, radius, space } from '../theme';
import { isRTL } from '../lib/rtl';

/** "ابحث عن مكان": قلعة كركوك، جامعة كركوك، اسم شارع أو منطقة */
export default function SearchScreen() {
  const { t } = useTranslation();
  const { target = 'book' } = useLocalSearchParams<{ target?: string }>();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<SavedPlace[]>('/api/me/places').then(setSaved).catch(() => {});
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      api<PlaceResult[]>('/api/geo/search', { query: { q: q.trim() } })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 450);
  }, [q]);

  const choose = (p: { lat: number; lng: number; name: string; address?: string | null }) => {
    const address = p.address && p.address !== p.name ? `${p.name} – ${p.address}` : p.name;
    placeBus.emit(target, { lat: p.lat, lng: p.lng, address });
    router.back();
  };

  const showSaved = q.trim().length < 2;

  return (
    <Screen>
      <Row style={{ padding: space.lg, gap: space.md }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="close" />
        </Pressable>
        <Row
          style={{
            flex: 1,
            backgroundColor: colors.white,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.primary,
            paddingHorizontal: space.md,
            minHeight: 50,
          }}
        >
          <Icon name="magnify" color={colors.primary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text, textAlign: isRTL() ? 'right' : 'left' }}
            returnKeyType="search"
          />
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
        </Row>
      </Row>

      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl, paddingBottom: space.md }}>
        <Icon name="map-search-outline" color={colors.primary} />
        <T v="bodyBold" color={colors.primary}>
          {t('search.chooseOnMap')}
        </T>
      </Pressable>

      {showSaved ? (
        <FlatList
          data={saved}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: space.lg }}
          ListHeaderComponent={saved.length ? <T v="caption" style={{ paddingHorizontal: space.sm }}>{t('search.saved')}</T> : null}
          renderItem={({ item }) => (
            <ListItem
              icon={item.kind === 'home' ? 'home-variant' : item.kind === 'work' ? 'briefcase-variant' : 'star'}
              title={item.label}
              subtitle={item.address}
              onPress={() => choose({ lat: item.lat, lng: item.lng, name: item.label, address: item.address })}
            />
          )}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: space.lg }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={loading ? null : <Empty icon="map-search-outline" text={t('search.noResults')} />}
          renderItem={({ item }) => (
            <ListItem
              icon={item.source === 'local' ? 'star' : 'map-marker'}
              title={item.name}
              subtitle={item.address}
              onPress={() => choose(item)}
            />
          )}
        />
      )}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
