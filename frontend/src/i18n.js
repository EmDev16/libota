import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import fr from './locales/fr';
import nl from './locales/nl';
import ln from './locales/ln';

// The languages of the site, in the order they are shown
export const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'ln', label: 'Lingala' },
  { code: 'nl', label: 'Nederlands' }
];
const CODES = LANGUAGES.map((l) => l.code);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      nl: { translation: nl },
      ln: { translation: ln }
    },
    supportedLngs: CODES,
    nonExplicitSupportedLngs: true, // fr-BE counts as fr
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    // No fixed language here: the one chosen last on this device wins, a first visit follows the browser.
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'libota-language'
    }
  });

// Switch the language of the whole site (and remember it on this device)
export const setLanguage = (code) => {
  if (CODES.includes(code) && i18n.resolvedLanguage !== code) {
    i18n.changeLanguage(code);
  }
};

export default i18n;
