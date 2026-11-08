import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { colors } from '../theme';
import { CarIcon, useSmoothVehicle } from './CarIcon';
import { MarkerView } from './MapPins';
import type { YMapHandle, YMapProps } from './mapTypes';

export { CenterPin, Pin } from './MapPins';
export type { MapMarker, YMapHandle, YMapProps } from './mapTypes';

/**
 * نسخة الويب للمعاينة فقط (MapLibre Native ما يشتغل بالمتصفح).
 * خلفية بسيطة تشبه الخريطة + الدبابيس والمسار — حتى نشوف تصميم الشاشات بالمتصفح.
 * التطبيق الحقيقي على أندرويد و iOS يستخدم YMap.tsx (خرائط OpenStreetMap).
 */
const DEG_PER_PX = 0.00004; // تقريباً زووم 15

export const YMap = forwardRef<YMapHandle, YMapProps>(function YMap(
  { initialCenter, markers = [], route, routeColor = colors.primary, onCenterChanged, style, vehicle, vehicleColor = colors.primaryDark },
  ref,
) {
  const car = useSmoothVehicle(vehicle ?? null);
  const [center, setCenter] = useState(initialCenter);
  const [size, setSize] = useState({ w: 400, h: 800 });
  const cb = useRef(onCenterChanged);
  cb.current = onCenterChanged;

  useEffect(() => {
    cb.current?.(initialCenter, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo(p) {
      setCenter(p);
      cb.current?.(p, true);
    },
    follow(p) {
      setCenter(p);
    },
    unfollow() {},
    fitTo(points) {
      if (!points.length) return;
      const c = { lat: points.reduce((a, p) => a + p.lat, 0) / points.length, lng: points.reduce((a, p) => a + p.lng, 0) / points.length };
      setCenter({ lat: c.lat - 0.012, lng: c.lng });
    },
  }));

  const project = (lat: number, lng: number) => ({
    x: size.w / 2 + (lng - center.lng) / DEG_PER_PX / 2,
    y: size.h / 2 - (lat - center.lat) / DEG_PER_PX / 2,
  });

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const streets = Array.from({ length: 14 }, (_, i) => i);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#ECEEF2', overflow: 'hidden' }, style]} onLayout={onLayout}>
      <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill as any}>
        {streets.map((i) => (
          <Line key={`h${i}`} x1={0} y1={i * 70 + 20} x2={size.w} y2={i * 70 + 50} stroke="#FFFFFF" strokeWidth={i % 4 === 0 ? 10 : 5} />
        ))}
        {streets.map((i) => (
          <Line key={`v${i}`} x1={i * 85 - 30} y1={0} x2={i * 85 + 10} y2={size.h} stroke="#FFFFFF" strokeWidth={i % 3 === 0 ? 9 : 4} />
        ))}
        {route && route.length > 1 ? (
          <Polyline
            points={route.map(([lng, lat]) => { const p = project(lat, lng); return `${p.x},${p.y}`; }).join(' ')}
            fill="none"
            stroke={routeColor}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>
      {markers.map((m) => {
        const p = project(m.lat, m.lng);
        const pin = m.kind === 'pickup' || m.kind === 'dropoff' || m.kind === 'stop';
        return (
          <View key={m.id} pointerEvents="none" style={{ position: 'absolute', left: p.x, top: p.y, transform: [{ translateX: '-50%' as any }, { translateY: pin ? ('-100%' as any) : ('-50%' as any) }] }}>
            <MarkerView marker={m} />
          </View>
        );
      })}
      {car ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: project(car.lat, car.lng).x - 24, top: project(car.lat, car.lng).y - 24 }}>
          <CarIcon size={48} heading={car.heading} color={vehicleColor} />
        </View>
      ) : null}
    </View>
  );
});
