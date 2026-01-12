// Purpose: Load, cache, and provide localization strings with English fallback.
// Persists: Caches localization packs in AsyncStorage.
// Security Risks: Fetches pack URLs; avoid logging pack contents or URLs with tokens.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Localization from "expo-localization";

import enStrings from "../localization/en.json";
import { getLocalizationLatest } from "./apiClient";

export type Locale = "en" | "zh-Hans" | "es";

export const SUPPORTED_LOCALES: Locale[] = ["en", "zh-Hans", "es"];

const PACK_STORAGE_PREFIX = "localization_pack_";
const VERSION_STORAGE_PREFIX = "localization_version_";

export type LocalizationState = {
  locale: Locale;
  strings: Record<string, string>;
  uiVersion: string;
};

export function getDefaultLocale(): Locale {
  const systemLocale = Localization.getLocales()[0]?.languageTag ?? "en";
  if (systemLocale.startsWith("zh")) {
    return "zh-Hans";
  }
  if (systemLocale.startsWith("es")) {
    return "es";
  }
  return "en";
}

export async function computeUiVersion(): Promise<string> {
  const keys = Object.keys(enStrings).sort();
  const canonical = JSON.stringify(
    keys.reduce<Record<string, string>>((acc, key) => {
      acc[key] = enStrings[key as keyof typeof enStrings];
      return acc;
    }, {})
  );
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
}

function stripHeaderKeys(strings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(strings).filter(([key]) => !key.startsWith("__file_header_"))
  );
}

export async function loadLocalization(locale: Locale): Promise<LocalizationState> {
  const uiVersion = await computeUiVersion();
  const cachedPackRaw = await AsyncStorage.getItem(`${PACK_STORAGE_PREFIX}${locale}`);
  const cachedVersion = await AsyncStorage.getItem(`${VERSION_STORAGE_PREFIX}${locale}`);
  const baseStrings = stripHeaderKeys(enStrings);
  let strings = baseStrings;

  if (cachedPackRaw && cachedVersion === uiVersion) {
    try {
      const parsed = JSON.parse(cachedPackRaw) as Record<string, string>;
      strings = { ...baseStrings, ...stripHeaderKeys(parsed) };
    } catch {
      strings = baseStrings;
    }
  }

  if (locale !== "en") {
    try {
      const latest = await getLocalizationLatest(locale);
      if (latest.ui_version && latest.ui_version !== cachedVersion) {
        const response = await fetch(latest.pack_url);
        if (response.ok) {
          const pack = (await response.json()) as Record<string, string>;
          await AsyncStorage.setItem(
            `${PACK_STORAGE_PREFIX}${locale}`,
            JSON.stringify(pack)
          );
          await AsyncStorage.setItem(`${VERSION_STORAGE_PREFIX}${locale}`, latest.ui_version);
          strings = { ...baseStrings, ...stripHeaderKeys(pack) };
        }
      }
    } catch {
      // Ignore network errors and keep cached or base strings.
    }
  }

  return {
    locale,
    strings,
    uiVersion
  };
}

export function translate(strings: Record<string, string>, key: string): string {
  return strings[key] ?? enStrings[key as keyof typeof enStrings] ?? key;
}
