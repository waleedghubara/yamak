import { api } from './api';
import type { KhattiBooking, KhattiKind, KhattiPost, KhattiSubscription, PassengerType } from './types';

/** خطي: المقاعد المشتركة داخل كركوك (التطبيق وسيط عرض وتعارف فقط) */
export const PASSENGER_TYPES: PassengerType[] = ['men', 'women', 'family', 'students', 'mixed'];

export interface PostFilters {
  kind?: KhattiKind;
  passengerType?: PassengerType;
  from?: string;
  to?: string;
  date?: string;
  minPrice?: number;
  maxPrice?: number;
  seats?: number;
  mine?: boolean;
}

export function listPosts(f: PostFilters = {}) {
  return api<KhattiPost[]>('/api/khatti/posts', {
    query: { ...f, mine: f.mine ? '1' : undefined },
  });
}

export interface NewPost {
  kind: KhattiKind;
  passengerType: PassengerType;
  from: { lat: number; lng: number; label: string };
  to: { lat: number; lng: number; label: string };
  departAt: string;
  seats: number;
  price: number;
  priceUnit: 'per_seat' | 'per_trip';
  note?: string | null;
  captainPhotoId?: string | null;
  carPhotoId?: string | null;
}

export const createPost = (b: NewPost) => api<KhattiPost>('/api/khatti/posts', { body: b });
export const renewPost = (id: string) => api<KhattiPost>(`/api/khatti/posts/${id}/renew`, { body: {} });
export const removePost = (id: string) => api(`/api/khatti/posts/${id}`, { method: 'DELETE' });
export const bookPost = (id: string, seats = 1) => api<KhattiBooking>(`/api/khatti/posts/${id}/book`, { body: { seats } });

export const myBookings = () => api<KhattiBooking[]>('/api/khatti/bookings');
export const acceptBooking = (id: string) => api<KhattiBooking>(`/api/khatti/bookings/${id}/accept`, { body: {} });
export const declineBooking = (id: string) => api<KhattiBooking>(`/api/khatti/bookings/${id}/decline`, { body: {} });
export const confirmBooking = (id: string) => api<KhattiBooking>(`/api/khatti/bookings/${id}/confirm`, { body: {} });
export const cancelBooking = (id: string) => api<KhattiBooking>(`/api/khatti/bookings/${id}/cancel`, { body: {} });

export const getSubscription = () => api<KhattiSubscription>('/api/khatti/subscription');
export const activateSubscription = () => api<KhattiSubscription>('/api/khatti/subscription', { body: {} });
