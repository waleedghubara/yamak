import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type LngLat,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Dimensions, Linking, Pressable, StyleSheet, type NativeSyntheticEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMapStyle } from '../lib/mapStyle';
import { colors, fonts, radius } from '../theme';
import { BottomModal, Icon, ListItem, T } from './ui';
import { CarIcon, useSmoothVehicle } from './CarIcon';
import { MarkerView } from './MapPins';
import type { YMapHandle, YMapProps as Props } from './mapTypes';

export { CenterPin, Pin } from './MapPins';

/**
 * خريطة يمك — MapLibre + بيانات OpenStreetMap، تجي من سيرفرنا عبر Cloudflare (أسرع من العراق).
 * الستايل والبلاطات تنحفظ بالجهاز (شوف lib/mapStyle.ts).
 */
export type { MapMarker, YMapHandle, YMapProps } from './mapTypes';

export const YMap = forwardRef<YMapHandle, Props>(function YMap(
  {
    initialCenter,
    initialZoom = 15,
    markers = [],
    route,
    routeColor = colors.primary,
    onCenterChanged,
    onMoveStart,
    style,
    interactive = true,
    vehicle,
    vehicleColor = colors.primaryDark,
  },
  ref,
) {
  const camera = useRef<CameraRef>(null);
  const mapStyle = useMapStyle();
  // إذا انطلب تحريك الكاميرا قبل ما الخريطة تجهز، نبدأ منه
  const [initialView, setInitialView] = useState<{ center: LngLat; zoom: number } | null>(null);
  // اتجاه الخريطة بوضع الملاحة — السيارة تندار بالفرق حتى تبقى باتجاه الشارع
  const [mapBearing, setMapBearing] = useState(0);
  const lastCenter = useRef<LngLat | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo(p, zoom) {
      if (!camera.current) {
        setInitialView({ center: [p.lng, p.lat], zoom: zoom ?? 16 });
        return;
      }
      camera.current.easeTo({ center: [p.lng, p.lat], zoom: zoom ?? 16, duration: 600 });
    },
    follow(p, bearing, zoom = 16.5) {
      const center: LngLat = [p.lng, p.lat];
      lastCenter.current = center;
      const h = Dimensions.get('window').height;
      // تتبع ثنائي الأبعاد: بدون إمالة وبدون دوران الخريطة — السيارة تبقى فوق نص الشاشة
      camera.current?.easeTo({
        center,
        zoom,
        bearing: 0,
        pitch: 0,
        padding: { top: 0, bottom: Math.round(h * 0.18), left: 0, right: 0 },
        duration: 900,
        easing: 'linear',
      });
      setMapBearing(0);
    },
    unfollow() {
      if (lastCenter.current) {
        camera.current?.easeTo({ center: lastCenter.current, zoom: 15, bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
      }
      setMapBearing(0);
    },
    fitTo(points, padding = { top: 120, bottom: 360, left: 50, right: 50 }) {
      if (!points.length) return;
      if (!camera.current) {
        setInitialView({ center: [points[0].lng, points[0].lat], zoom: 14 });
        return;
      }
      if (points.length === 1) {
        camera.current?.easeTo({ center: [points[0].lng, points[0].lat], zoom: 16, duration: 600 });
        return;
      }
      const lngs = points.map((p) => p.lng);
      const lats = points.map((p) => p.lat);
      camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
        padding,
        duration: 700,
      });
    },
  }));

  const routeShape = useMemo(
    () =>
      route && route.length >= 2
        ? ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } } as GeoJSON.Feature)
        : null,
    [route],
  );

  const center: LngLat = [initialCenter.lng, initialCenter.lat];

  return (
    <>
    <Map
      style={[StyleSheet.absoluteFill, { backgroundColor: '#EEF0F3' }, style]}
      // رابط (مو JSON) حتى الجهاز يحفظه بكاشه ويفتح فوراً من ثاني مرة
      mapStyle={mapStyle.url}
      onDidFailLoadingMap={mapStyle.onFail}
      logo={false}
      attribution={false}
      compass={false}
      touchRotate={false}
      touchPitch={false}
      dragPan={interactive}
      touchZoom={interactive}
      onRegionWillChange={(e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
        if (e.nativeEvent.userInteraction) onMoveStart?.();
      }}
      onRegionDidChange={(e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
        const [lng, lat] = e.nativeEvent.center;
        onCenterChanged?.({ lat, lng }, e.nativeEvent.userInteraction);
      }}
    >
      <Camera ref={camera} initialViewState={initialView ?? { center, zoom: initialZoom }} />

      {routeShape ? (
        <GeoJSONSource id="route" data={routeShape}>
          <Layer
            type="line"
            id="route-casing"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colors.white, 'line-width': 9 }}
          />
          <Layer
            type="line"
            id="route-line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': routeColor, 'line-width': 5 }}
          />
        </GeoJSONSource>
      ) : null}

      {markers.map((m) => (
        <Marker key={m.id} id={m.id} lngLat={[m.lng, m.lat]} anchor={m.kind === 'pickup' || m.kind === 'dropoff' || m.kind === 'stop' ? 'bottom' : 'center'}>
          <MarkerView marker={m} />
        </Marker>
      ))}

      {vehicle ? (
        <VehicleMarker
          target={mapBearing && vehicle.heading != null ? { ...vehicle, heading: (vehicle.heading - mapBearing + 360) % 360 } : vehicle}
          color={vehicleColor}
        />
      ) : null}
    </Map>
    <MapCredit />
    </>
  );
});

/** علامة «يمك تكسي» الصغيرة + زر ⓘ يفتح مصادر بيانات الخريطة (إسناد OSM/OpenFreeMap إلزامي) */
function MapCredit() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} style={creditStyles.badge} accessibilityLabel={t('map.credits')}>
        <T style={creditStyles.text}>{t('appName')}</T>
        <Icon name="information-outline" size={12} color={colors.textSoft} />
      </Pressable>
      <BottomModal visible={open} onClose={() => setOpen(false)} title={t('map.credits')}>
        <T v="caption">{t('map.creditsBody')}</T>
        <ListItem icon="open-in-new" title="OpenStreetMap" subtitle="openstreetmap.org/copyright" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} />
        <ListItem icon="open-in-new" title="OpenFreeMap" subtitle="openfreemap.org" onPress={() => Linking.openURL('https://openfreemap.org/')} />
      </BottomModal>
    </>
  );
}

const creditStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 6,
    start: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 16, color: colors.primaryDark },
});

/** سيارة الكابتن: تنزلق بين المواقع وتندار باتجاه السير */
function VehicleMarker({ target, color }: { target: { lat: number; lng: number; heading?: number | null }; color: string }) {
  const p = useSmoothVehicle(target);
  if (!p) return null;
  return (
    <Marker id="vehicle" lngLat={[p.lng, p.lat]} anchor="center">
      <CarIcon size={48} heading={p.heading} color={color} />
    </Marker>
  );
}

