import { bn } from "./bn.ts";
import { en, type TranslationDictionary } from "./en.ts";

export type Locale = "bn" | "en";

export const dictionaries: Record<Locale, TranslationDictionary> = {
  bn,
  en,
};

export const DEFAULT_LOCALE: Locale = "bn";

type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}.${P}`
    : never
  : never;

type Paths<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? Join<K, Paths<T[K]>>
    : K;
}[keyof T];

export type TranslationKey = Paths<TranslationDictionary>;

export function translate(
  key: TranslationKey,
  vars?: Record<string, string | number>,
  locale: Locale = DEFAULT_LOCALE
): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const parts = key.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      current = undefined;
      break;
    }
  }

  let text = typeof current === "string" ? current : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function useTranslation(locale: Locale = DEFAULT_LOCALE) {
  return {
    locale,
    t: (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(key, vars, locale),
  };
}
