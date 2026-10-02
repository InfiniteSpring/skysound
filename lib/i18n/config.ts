/** The ten most widely spoken languages (total speakers). English is the default. */
export const LANGS = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ur"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

/** Each language's name in itself, for the language menu. */
export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  zh: "中文",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  ar: "العربية",
  bn: "বাংলা",
  pt: "Português",
  ru: "Русский",
  ur: "اردو",
};

/** Open Graph locales. */
export const HTML_LOCALE: Record<Lang, string> = {
  en: "en_US",
  zh: "zh_CN",
  hi: "hi_IN",
  es: "es_ES",
  fr: "fr_FR",
  ar: "ar_AR",
  bn: "bn_BD",
  pt: "pt_BR",
  ru: "ru_RU",
  ur: "ur_PK",
};

const RTL = new Set<Lang>(["ar", "ur"]);
export const dirOf = (lang: Lang) => (RTL.has(lang) ? "rtl" : "ltr");

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/**
 * Public URL for an internal path. English lives at the root ("/object/sirius"),
 * other languages under their prefix ("/ru/object/sirius").
 */
export function localizePath(path: string, lang: Lang) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang === DEFAULT_LANG) return clean;
  return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

/** Split a public pathname into language and the language-free path. */
export function splitLocale(pathname: string): { lang: Lang; path: string } {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|$)(.*)$/);
  if (m && isLang(m[1]) && m[1] !== DEFAULT_LANG) return { lang: m[1], path: m[2] || "/" };
  return { lang: DEFAULT_LANG, path: pathname || "/" };
}

/** Pick the localized value with English as the fallback. */
export function pick<T>(values: Partial<Record<Lang, T>> | undefined, lang: Lang, fallback: T): T {
  return values?.[lang] ?? values?.[DEFAULT_LANG] ?? fallback;
}
