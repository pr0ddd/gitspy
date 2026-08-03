import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import ruCommon from './locales/ru/common.json';
import ruErrors from './locales/ru/errors.json';

export const LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'en';

const resources = {
  en: { common: enCommon, errors: enErrors },
  ru: { common: ruCommon, errors: ruErrors },
};

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['en'];
    keySeparator: false;
  }
}

const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

const preferredLocale = (): Locale => {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const base = tag.split('-')[0]?.toLowerCase();
    if (base && isLocale(base)) return base;
  }
  return FALLBACK_LOCALE;
};

void i18next.use(initReactI18next).init({
  resources,
  lng: preferredLocale(),
  fallbackLng: FALLBACK_LOCALE,
  defaultNS: 'common',
  keySeparator: false,
  interpolation: { escapeValue: false },
});

export default i18next;
