// Purpose: Manage persisted settings like locale and device_install_id via JSON storage with diagnostics.
// Persists: Reads and writes settings within AsyncStorage key calcium_tracker_v1.
// Security Risks: Handles device_install_id persistence.
import { v4 as uuidv4 } from "uuid";

import { getSettingValue, setSettingValue } from "./db";
import { log } from "../utils/logger";

const SETTING_LOCALE = "locale";
const SETTING_DEVICE_INSTALL_ID = "device_install_id";

export async function getSetting(key: string): Promise<string | null> {
  log("storage", "get", { key });
  return getSettingValue(key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  log("storage", "set", { key });
  await setSettingValue(key, value);
}

export async function getOrCreateDeviceInstallId(): Promise<string> {
  const existing = await getSetting(SETTING_DEVICE_INSTALL_ID);
  if (existing) {
    return existing;
  }
  const created = uuidv4();
  await setSetting(SETTING_DEVICE_INSTALL_ID, created);
  return created;
}

export async function getLocaleSetting(defaultLocale: string): Promise<string> {
  const existing = await getSetting(SETTING_LOCALE);
  if (existing) {
    return existing;
  }
  await setSetting(SETTING_LOCALE, defaultLocale);
  return defaultLocale;
}

export async function setLocaleSetting(locale: string): Promise<void> {
  await setSetting(SETTING_LOCALE, locale);
}
