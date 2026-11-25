/** أنواع البيانات — نفس شكل ردود السيرفر */

export type Lang = 'ar' | 'ckb' | 'tk';

export type RideStatus =
  | 'DRAFT'
  | 'SEARCHING'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'IN_TRIP'
  | 'COMPLETED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_DRIVER'
  | 'NO_DRIVER_FOUND'
  | 'EMERGENCY';

export const ACTIVE_STATUSES: RideStatus[] = ['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_TRIP'];
export const CAPTAIN_ACTIVE: RideStatus[] = ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_TRIP'];

export interface Point {
  lat: number;
  lng: number;
  address?: string | null;
}

export type LngLatArr = [number, number];

export interface User {
  id: string;
  phone: string;
  name: string | null;
  photoUrl: string | null;
  /** تاريخ الميلاد YYYY-MM-DD */
  birthDate?: string | null;
  lang: Lang;
  cancelPenaltyPending: boolean;
}

export interface CaptainProfile {
  /** رقم الكابتن الثابت (ينعطى وقت القبول) */
  code?: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'blocked';
  category: string;
  carModel: string;
  carColor: string;
  plateNumber: string;
  rating: number | null;
  ratingCount: number;
  balanceOwed: number;
  totalTrips: number;
  adminNote: string | null;
  online?: boolean;
}

export interface MerchantProfile {
  status: 'pending' | 'approved' | 'rejected' | 'blocked';
  fullName: string;
  storeName: string;
  location: Point;
  adminNote: string | null;
}

export interface Me {
  user: User;
  captain: CaptainProfile | null;
  merchant?: MerchantProfile | null;
}

export interface Names {
  ar: string;
  ckb: string;
  tk: string;
}

export interface QuoteOption {
  category: string;
  name: Names;
  baseFare: number;
  distanceFare: number;
  arrivalFare: number;
  penaltyFare: number;
  fareBeforeDiscount: number;
  discount: number;
  finalFare: number;
  driverDistanceKm: number | null;
  driverEtaMin: number | null;
  available: boolean;
  promoError: string | null;
}

export interface Quote {
  quoteId: string;
  serviceType?: ServiceType;
  expiresAt: string;
  distanceKm: number;
  durationMin: number;
  routeGeometry: LngLatArr[];
  period: 'day' | 'night';
  penaltyPercent: number;
  promoCode: string | null;
  options: QuoteOption[];
}

export interface RideCaptain {
  id: string;
  /** رقم الكابتن: يطلع للزبون ويا الاسم */
  code?: number | null;
  name: string | null;
  photoUrl: string | null;
  phone: string | null;
  rating: number | null;
  ratingCount: number;
  carModel: string;
  carColor: string;
  plateNumber: string;
  category: string;
  location: { lat: number; lng: number; heading: number | null } | null;
}

export type ServiceType = 'ride' | 'delivery';

export interface DeliveryView {
  itemType: string;
  photoUrl: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  merchant: { storeName: string } | null;
}

export interface Ride {
  id: string;
  number: number | null;
  serviceType: ServiceType;
  delivery: DeliveryView | null;
  status: RideStatus;
  pickup: Point;
  dropoff: Point;
  stops: Point[];
  roundTrip: boolean;
  note: string | null;
  distanceKm: number;
  durationMin: number;
  routeGeometry: LngLatArr[] | null;
  pricingPeriod: 'day' | 'night';
  category: string | null;
  paymentMethod: 'cash' | 'wallet' | 'card';
  fare: {
    baseFare: number;
    distanceFare: number;
    arrivalFare: number;
    penaltyFare: number;
    fareBeforeDiscount: number;
    discount: number;
    finalFare: number;
    commission?: number;
  };
  driverDistanceKm: number | null;
  captain: RideCaptain | null;
  customer: { id: string; name: string | null; photoUrl: string | null; phone: string | null } | null;
  shareUrl: string | null;
  replacedByRideId: string | null;
  paused: boolean;
  waitingSeconds: number;
  emergency: boolean;
  times: {
    createdAt: string;
    requestedAt: string | null;
    acceptedAt: string | null;
    enRouteAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
  };
  cancelReason: string | null;
  rating: { stars: number; tags: string[]; comment: string | null } | null;
}

export interface Tracking {
  rideId: string;
  phase: 'to_pickup' | 'to_destination';
  remainingKm: number;
  etaMin: number;
  geometry: LngLatArr[];
}

export interface Offer {
  rideId: string;
  number: number | null;
  serviceType: ServiceType;
  delivery: { itemType: string; photoUrl: string | null; merchant: { storeName: string } | null } | null;
  category: string;
  pickup: Point;
  dropoff: Point;
  stops: Point[];
  roundTrip: boolean;
  note: string | null;
  distanceKm: number;
  durationMin: number;
  fare: number;
  fareBeforeDiscount: number;
  customerName: string | null;
  pickupDistanceKm: number;
  timeoutSec: number;
  expiresAt: string;
  /** مرحلة البحث (1 = الأقرب) */
  stage?: number;
  /** خصم كود على الزبون — الشركة تعوّض الكابتن عنه */
  discount?: number;
  discountCompensated?: boolean;
}

export interface ChatMessage {
  id: number;
  rideId: string;
  senderRole: 'customer' | 'captain';
  text: string;
  quickKey: string | null;
  createdAt: string;
}

export interface SavedPlace {
  id: string;
  kind: 'home' | 'work' | 'favorite' | 'custom';
  label: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  source: 'local' | 'osm';
}

/** العنوان العكسي: المنطقة + الشارع + أقرب معلم */
export interface ReverseInfo {
  address: string | null;
  area: string | null;
  street: string | null;
  landmark: string | null;
  city?: string | null;
  inServiceArea?: boolean;
}

export interface NearbyCar {
  id: string;
  lat: number;
  lng: number;
  heading: number | null;
  category: string;
}

export interface KhattiAuthor {
  name: string;
  captainPhotoUrl: string | null;
  carPhotoUrl: string | null;
  car: string | null;
}

export type KhattiKind = 'offer' | 'request';
export type PassengerType = 'men' | 'women' | 'family' | 'students' | 'mixed';
export type KhattiPostStatus = 'active' | 'full' | 'expired' | 'rejected' | 'removed';

/** إعلان خط: كابتن يعرض مقاعد (offer) أو زبون يطلب خط (request) */
export interface KhattiPost {
  id: string;
  kind: KhattiKind;
  passengerType: PassengerType;
  from: { label: string; lat: number; lng: number };
  to: { label: string; lat: number; lng: number };
  departAt: string;
  seatsTotal: number;
  seatsLeft: number;
  price: number;
  priceUnit: 'per_seat' | 'per_trip';
  note: string | null;
  status: KhattiPostStatus;
  adminNote?: string | null;
  expiresAt: string;
  renewedCount: number;
  createdAt: string;
  mine: boolean;
  author: KhattiAuthor;
}

export interface KhattiBooking {
  id: string;
  postId: string;
  status: 'pending' | 'accepted' | 'confirmed' | 'declined' | 'cancelled';
  seats: number;
  role: 'author' | 'booker';
  route: { from: string; to: string };
  departAt: string;
  price: number;
  priceUnit: 'per_seat' | 'per_trip';
  /** الرقم يطلع بعد التأكيد المتبادل بس */
  other: { name: string; phone: string | null };
}

export interface KhattiSubscription {
  mode: 'subscription' | 'free';
  state: 'none' | 'free' | 'paid' | 'expired' | 'not_required';
  active: boolean;
  freeUntil: string | null;
  paidUntil: string | null;
  monthlyFee: number;
  freeMonths: number;
}

/** مكافأة الكابتن ويا تقدمه */
export interface Reward {
  id: string;
  title: string;
  tripsRequired: number;
  amount: number;
  startsAt: string;
  endsAt: string;
  minTripKm: number;
  progress: number;
  earned: boolean;
}

/** كود خصم فعال يطلع كبانر للزبون */
export interface PromoBanner {
  code: string;
  text: string | null;
  kind: 'percent' | 'fixed';
  value: number;
}

export interface PublicConfig {
  serviceArea: { lat: number; lng: number; radiusKm: number };
  categories: { code: string; name: Names }[];
  emergencyNumbers: { label: string; number: string }[];
  supportPhone: string | null;
  /** رقم دعم الكباتن (يرجع من /api/config) */
  captainSupportPhone?: string | null;
  termsUrl: string;
  privacyUrl: string;
  cancelPenaltyPercent: number;
  deliveryEnabled?: boolean;
  khattiEnabled?: boolean;
  khattiFee?: number;
  khattiFreeMonths?: number;
  khattiMinCaptainDays?: number;
  cardsEnabled?: boolean;
  promoMaxPerDay?: number;
  /** التحديث الإجباري: أقل إصدار مسموح + روابط المتجر */
  minAppVersion?: string | null;
  storeUrl?: { android: string | null; ios: string | null };
  /** طلبات الزبائن شغالة؟ (زر بلوحة الإدارة) */
  ridesEnabled?: boolean;
  otpChannel?: 'whatsapp' | 'sms';
  lists: {
    cancelReasonsCustomer: string[];
    cancelReasonsCaptain: string[];
    reportCategories: string[];
    ratingTags: string[];
    quickMessagesCustomer: string[];
    quickMessagesCaptain: string[];
    supportTopics: string[];
    deliveryItemTypes?: string[];
  };
}

export interface Ad {
  id: string;
  title: string;
  imageUrl: string | null;
  actionUrl: string | null;
}
