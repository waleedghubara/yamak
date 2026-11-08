import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { PublicConfig } from '../lib/types';

/** إعدادات عامة من السيرفر (الفئات، أرقام الطوارئ، أسباب الإلغاء...) — تتغير من لوحة الإدارة */
const FALLBACK: PublicConfig = {
  serviceArea: { lat: 35.4681, lng: 44.3922, radiusKm: 35 },
  categories: [
    { code: 'taxi', name: { ar: 'أجرة', ckb: 'تەکسی', tk: 'Taksi' } },
    { code: 'private', name: { ar: 'خصوصي', ckb: 'تایبەت', tk: 'Hususi' } },
  ],
  emergencyNumbers: [{ label: 'الطوارئ', number: '911' }],
  supportPhone: '07862162228',
  termsUrl: '',
  privacyUrl: '',
  cancelPenaltyPercent: 1,
  deliveryEnabled: false,
  otpChannel: 'sms',
  lists: {
    cancelReasonsCustomer: ['captain_far', 'captain_late', 'changed_mind', 'ordered_by_mistake', 'other'],
    cancelReasonsCaptain: ['customer_no_show', 'customer_asked', 'car_problem', 'unsafe_location', 'other'],
    reportCategories: ['captain_behavior', 'different_car', 'price_issue', 'car_cleanliness', 'bad_driving', 'other'],
    ratingTags: ['excellent_driving', 'respectful', 'clean_car', 'arrived_fast'],
    quickMessagesCustomer: ['where_are_you', 'wait_one_minute', 'at_the_door', 'coming_now'],
    quickMessagesCaptain: ['im_here', 'on_my_way', 'wait_one_minute', 'at_the_door'],
    supportTopics: ['ride_issue', 'lost_item', 'payment', 'account', 'suggestion', 'other'],
    deliveryItemTypes: ['documents', 'food', 'clothes', 'electronics', 'home', 'medicine', 'other'],
  },
};

const ConfigContext = createContext<PublicConfig>(FALLBACK);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<PublicConfig>(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    const load = (attempt: number) =>
      api<PublicConfig>('/api/config')
        .then((c) => !cancelled && setCfg(c))
        .catch(() => {
          if (!cancelled && attempt < 5) setTimeout(() => load(attempt + 1), 3000 * (attempt + 1));
        });
    load(0);
    return () => {
      cancelled = true;
    };
  }, []);
  return <ConfigContext.Provider value={cfg}>{children}</ConfigContext.Provider>;
}

export function useAppConfig() {
  return useContext(ConfigContext);
}
