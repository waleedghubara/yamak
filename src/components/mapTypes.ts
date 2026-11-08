import type { StyleProp, ViewStyle } from 'react-native';
import type { LngLatArr } from '../lib/types';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: 'pickup' | 'dropoff' | 'stop' | 'car' | 'me' | 'nearby';
  heading?: number | null;
}

export interface YMapHandle {
  flyTo: (p: { lat: number; lng: number }, zoom?: number) => void;
  fitTo: (points: { lat: number; lng: number }[], padding?: { top: number; bottom: number; left: number; right: number }) => void;
  /** وضع الملاحة: الكاميرا تتبع السيارة وتندار باتجاه السير (السيارة تطلع تحت الشاشة) */
  follow: (p: { lat: number; lng: number }, bearing: number, zoom?: number) => void;
  /** طلوع من وضع الملاحة: الشمال فوك والخريطة مسطحة */
  unfollow: () => void;
}

export interface YMapProps {
  initialCenter: { lat: number; lng: number };
  /** سيارة الكابتن: تتحرك بنعومة وتندار حسب اتجاه السير */
  vehicle?: { lat: number; lng: number; heading?: number | null } | null;
  vehicleColor?: string;
  initialZoom?: number;
  markers?: MapMarker[];
  route?: LngLatArr[] | null;
  routeColor?: string;
  onCenterChanged?: (center: { lat: number; lng: number }, byUser: boolean) => void;
  onMoveStart?: () => void;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}
