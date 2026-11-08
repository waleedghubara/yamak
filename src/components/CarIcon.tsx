import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Rect } from 'react-native-svg';
import { haversineKm } from '../lib/geo';
import { colors } from '../theme';

/** سيارة من فوق — مقدمتها للأعلى، وتندار حسب اتجاه السير (heading بالدرجات، 0 = شمال) */
export function CarIcon({ size = 44, color = colors.primary, heading = 0 }: { size?: number; color?: string; heading?: number | null }) {
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: `${Math.round(heading ?? 0)}deg` }] }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Ellipse cx={20.5} cy={21} rx={10.5} ry={17.5} fill="rgba(0,0,0,0.18)" />
        <Rect x={11} y={3} width={18} height={34} rx={7} fill={color} stroke="#FFFFFF" strokeWidth={2} />
        <Rect x={13.5} y={9} width={13} height={7} rx={2.5} fill="#E9E1F8" />
        <Rect x={14.5} y={17.5} width={11} height={8} rx={2} fill="rgba(0,0,0,0.22)" />
        <Rect x={13.5} y={27} width={13} height={5} rx={2} fill="#E9E1F8" opacity={0.85} />
        <Circle cx={14.5} cy={5.5} r={1.4} fill="#FFE08A" />
        <Circle cx={25.5} cy={5.5} r={1.4} fill="#FFE08A" />
      </Svg>
    </View>
  );
}

export interface VehiclePos {
  lat: number;
  lng: number;
  heading?: number | null;
}

function bearing(a: VehiclePos, b: VehiclePos) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * حركة ناعمة للسيارة بين تحديثات الموقع (كل ~4 ثواني):
 * تنزلق من النقطة القديمة للجديدة خلال ثانية، وتلف بأقصر اتجاه.
 * إذا ما وصل اتجاه من الجهاز نحسبه من آخر نقطتين.
 */
export function useSmoothVehicle(target: VehiclePos | null | undefined, durationMs = 1200): VehiclePos | null {
  const [pos, setPos] = useState<VehiclePos | null>(target ?? null);
  const cur = useRef<VehiclePos | null>(target ?? null);
  const lastTarget = useRef<VehiclePos | null>(target ?? null);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    if (!target) {
      cur.current = null;
      lastTarget.current = null;
      setPos(null);
      return;
    }
    const prev = lastTarget.current;
    let heading = target.heading;
    if ((heading == null || heading < 0) && prev && haversineKm(prev, target) > 0.005) heading = bearing(prev, target);
    if (heading == null || heading < 0) heading = cur.current?.heading ?? 0;
    lastTarget.current = { ...target, heading };

    const from = cur.current;
    // أول موقع أو قفزة كبيرة (أكثر من 1 كم): بدون حركة
    if (!from || haversineKm(from, target) > 1) {
      cur.current = { lat: target.lat, lng: target.lng, heading };
      setPos(cur.current);
      return;
    }
    const fromH = from.heading ?? heading;
    const dh = ((heading - fromH + 540) % 360) - 180;
    const start = Date.now();
    let lastPaint = 0;
    const step = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      const p = {
        lat: from.lat + (target.lat - from.lat) * t,
        lng: from.lng + (target.lng - from.lng) * t,
        heading: (fromH + dh * Math.min(1, t * 2) + 360) % 360,
      };
      cur.current = p;
      // ~25 إطار بالثانية يكفي وما يثقل التلفون
      if (t === 1 || now - lastPaint >= 40) {
        lastPaint = now;
        setPos(p);
      }
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target?.lat, target?.lng, target?.heading, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return pos;
}
