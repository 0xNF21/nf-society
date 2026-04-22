export type Locale = "fr" | "en";

import { landingTranslations } from "./landing";
import { pagesTranslations } from "./pages";
import { multiplayerTranslations } from "./multiplayer";
import { chanceTranslations } from "./chance";
import { componentsTranslations } from "./components";

export const translations = {
  ...landingTranslations,
  ...pagesTranslations,
  ...multiplayerTranslations,
  ...chanceTranslations,
  ...componentsTranslations,
} as const;

export function localeBcp47(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-US";
}

export function isFr(locale: Locale): boolean {
  return locale === "fr";
}

export function t(section: string, key: string, locale: Locale): string {
  const parts = key.split(".");
  let obj: any = (translations as any)[section];
  for (const part of parts) {
    if (!obj) return key;
    obj = obj[part];
  }
  if (!obj) return key;
  if (typeof obj === "object" && obj[locale] !== undefined) {
    return typeof obj[locale] === "function" ? obj[locale] : obj[locale];
  }
  return key;
}

