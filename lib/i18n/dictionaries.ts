import type { Lang } from "./config";
import ar from "./dict/ar";
import bn from "./dict/bn";
import en, { type Dictionary } from "./dict/en";
import es from "./dict/es";
import fr from "./dict/fr";
import hi from "./dict/hi";
import pt from "./dict/pt";
import ru from "./dict/ru";
import ur from "./dict/ur";
import zh from "./dict/zh";

export type { Dictionary };

/** All UI dictionaries. They are small, so client components import them directly. */
export const DICTIONARIES: Record<Lang, Dictionary> = { en, zh, hi, es, fr, ar, bn, pt, ru, ur };
export const getDictionary = (lang: Lang) => DICTIONARIES[lang];
