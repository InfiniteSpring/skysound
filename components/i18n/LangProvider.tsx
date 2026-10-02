"use client";

import { createContext, useContext, useMemo } from "react";
import { localizePath, pick, type Lang } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";

interface LangApi {
  lang: Lang;
  t: Dictionary;
  /** Public URL of a language-free path in the current language. */
  href(path: string): string;
  /** Localized display name of an object. */
  nameOf(o: { name: string; names?: Partial<Record<Lang, string>> }): string;
}

const LangContext = createContext<LangApi | null>(null);

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const api = useMemo<LangApi>(
    () => ({
      lang,
      t: getDictionary(lang),
      href: (path) => localizePath(path, lang),
      nameOf: (o) => pick(o.names, lang, o.name),
    }),
    [lang],
  );
  return <LangContext.Provider value={api}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}
