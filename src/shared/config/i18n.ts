import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';

export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'en';

const resources = {
  en: { common: enCommon, errors: enErrors },
};

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['en'];
    keySeparator: false;
  }
}

void i18next.use(initReactI18next).init({
  resources,
  lng: FALLBACK_LOCALE,
  fallbackLng: FALLBACK_LOCALE,
  defaultNS: 'common',
  keySeparator: false,
  interpolation: { escapeValue: false },
});

export default i18next;
