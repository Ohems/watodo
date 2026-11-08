import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enGB from './locales/en-GB.json';
import enUS from './locales/en-US.json';
import fi from './locales/fi.json';

/** UI languages the app ships translations for (BCP 47 tags). */
export const SUPPORTED_LANGUAGES = ['en-GB', 'en-US', 'fi'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Native display names for the language picker. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-GB': 'English (UK)',
  'en-US': 'English (US)',
  fi: 'Suomi',
};

export const DEFAULT_LANGUAGE: Language = 'en-GB';

const LANGUAGE_STORAGE_KEY = 'watodo-language';

function storedLanguage(): Language | null {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)
    ? (stored as Language)
    : null;
}

i18n.use(initReactI18next).init({
  resources: {
    'en-GB': { translation: enGB },
    'en-US': { translation: enUS },
    fi: { translation: fi },
  },
  lng: storedLanguage() ?? DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
  react: {
    // Re-render when a backend locale bundle is added after the initial load.
    bindI18n: 'languageChanged added',
  },
});

/**
 * Fetches the server-owned translations (currently the notification message
 * templates) for a language and merges them into the translation namespace
 * under `notifications`. The backend owns these strings because email/push
 * notifications are rendered server-side; the app falls back to the bundled
 * translations when the API is unreachable.
 */
export async function loadBackendBundle(lng: string): Promise<void> {
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(lng)) return;
  try {
    // Absolute URL: fetchBaseQuery-style Request building rejects relative
    // URLs outside the browser (e.g. in jsdom tests).
    const response = await fetch(
      `${window.location.origin}/api/v1/locales/${encodeURIComponent(lng)}`,
    );
    if (!response.ok) return;
    const data = (await response.json()) as { notifications?: Record<string, unknown> };
    if (data.notifications) {
      i18n.addResourceBundle(lng, 'translation', { notifications: data.notifications }, true, true);
    }
  } catch {
    // Network or parse error: keep the bundled translations.
  }
}

// Persist the choice so it applies on the next load before the current
// user (and their saved language) has been fetched from the API, and load the
// matching backend bundle.
i18n.on('languageChanged', language => {
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(language)) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    void loadBackendBundle(language);
  }
});

void loadBackendBundle(i18n.language);

export default i18n;
