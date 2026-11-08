import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { Button, Card, Empty, Icon, ListItem, Row, Screen, T } from '../../components/ui';
import { api } from '../../lib/api';
import { showError } from '../../lib/device';
import type { SavedPlace } from '../../lib/types';
import { setPendingBooking } from '../../state/placeBus';
import { colors, space } from '../../theme';

/** الأماكن المحفوظة: البيت، العمل، المفضلة، أو اسم يختاره المستخدم */
export default function PlacesScreen() {
  const { t } = useTranslation();
  const [places, setPlaces] = useState<SavedPlace[]>([]);

  const load = useCallback(() => {
    api<SavedPlace[]>('/api/me/places').then(setPlaces).catch(() => {});
  }, []);
  useFocusEffect(load);

  const home = places.find((p) => p.kind === 'home');
  const work = places.find((p) => p.kind === 'work');
  const others = places.filter((p) => p.kind !== 'home' && p.kind !== 'work');

  const remove = (p: SavedPlace) =>
    Alert.alert(p.label, t('places.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          api(`/api/me/places/${p.id}`, { method: 'DELETE' })
            .then(load)
            .catch(showError),
      },
    ]);

  const goTo = (p: SavedPlace) => {
    setPendingBooking({ dropoff: { lat: p.lat, lng: p.lng, address: p.address ?? p.label } });
    router.push('/book');
  };

  return (
    <Screen edges={['top']}>
      <FlatList
        data={others}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <T v="h1">{t('places.title')}</T>
            <Card style={{ padding: space.sm }}>
              <FixedPlace icon="home-variant" title={t('places.home')} place={home} onSet={() => router.push({ pathname: '/place-edit', params: { kind: 'home' } })} onGo={goTo} onRemove={remove} />
              <FixedPlace icon="briefcase-variant" title={t('places.work')} place={work} onSet={() => router.push({ pathname: '/place-edit', params: { kind: 'work' } })} onGo={goTo} onRemove={remove} />
            </Card>
            {!others.length ? <Empty icon="star-outline" text={t('places.empty')} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ padding: space.sm }}>
            <ListItem
              icon={item.kind === 'favorite' ? 'star' : 'map-marker'}
              title={item.label}
              subtitle={item.address}
              onPress={() => goTo(item)}
              right={
                <Pressable onPress={() => remove(item)} hitSlop={10}>
                  <Icon name="close-circle" color={colors.muted} />
                </Pressable>
              }
            />
          </Card>
        )}
        ListFooterComponent={<Button kind="secondary" icon="plus" title={t('places.add')} onPress={() => router.push({ pathname: '/place-edit', params: { kind: 'custom' } })} />}
      />
    </Screen>
  );
}

function FixedPlace({
  icon,
  title,
  place,
  onSet,
  onGo,
  onRemove,
}: {
  icon: 'home-variant' | 'briefcase-variant';
  title: string;
  place?: SavedPlace;
  onSet: () => void;
  onGo: (p: SavedPlace) => void;
  onRemove: (p: SavedPlace) => void;
}) {
  const { t } = useTranslation();
  if (!place) {
    return <ListItem icon={icon} title={title} subtitle={icon === 'home-variant' ? t('places.setHome') : t('places.setWork')} onPress={onSet} />;
  }
  return (
    <ListItem
      icon={icon}
      title={title}
      subtitle={place.address}
      onPress={() => onGo(place)}
      right={
        <Row>
          <Pressable onPress={onSet} hitSlop={10}>
            <Icon name="pencil" size={18} color={colors.muted} />
          </Pressable>
          <Pressable onPress={() => onRemove(place)} hitSlop={10}>
            <Icon name="close-circle" color={colors.muted} />
          </Pressable>
        </Row>
      }
    />
  );
}
