import enGB from './locales/en-GB.js';
import enUS from './locales/en-US.js';
import fi from './locales/fi.js';
import { isNotificationMessageKey } from './messages.js';
import type { LocaleBundle, NotificationMessageTemplate } from './types.js';

/** UI languages the server ships translations for (BCP 47 tags). */
export const SUPPORTED_LANGUAGES = ['en-GB', 'en-US', 'fi'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en-GB';

const bundles: Record<Language, LocaleBundle> = {
  'en-GB': enGB,
  'en-US': enUS,
  fi,
};

export function isSupportedLanguage(language: string): language is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(language);
}

/** The notification message templates of a locale, served to the frontend. */
export function getNotificationMessages(
  language: Language,
): Record<string, NotificationMessageTemplate> {
  return bundles[language].notifications;
}

/** Replaces {{placeholder}} occurrences with param values (i18next syntax). */
function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Renders a notification message in a language, e.g. for email or push
 * delivery. Unknown keys are a programming error; a key missing in the
 * requested language falls back to the default language.
 */
export function renderNotificationMessage(
  key: string,
  params: Record<string, unknown>,
  language: string,
): NotificationMessageTemplate {
  if (!isNotificationMessageKey(key)) {
    throw new Error(`Unknown notification message key: ${key}`);
  }
  const bundle = isSupportedLanguage(language) ? bundles[language] : bundles[DEFAULT_LANGUAGE];
  const entry = bundle.notifications[key] ?? bundles[DEFAULT_LANGUAGE].notifications[key];
  if (!entry) {
    throw new Error(`Notification message key "${key}" has no template`);
  }
  return {
    title: interpolate(entry.title, params),
    body: interpolate(entry.body, params),
  };
}
