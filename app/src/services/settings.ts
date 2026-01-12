// Purpose: Manage persisted settings like locale and device_install_id in SQLite.
// Persists: Reads and writes to SQLite settings table.
// Security Risks: Handles device_install_id persistence.
import { v4 as uuidv4 } from "uuid";

import { executeSql } from "./db";

const SETTING_LOCALE = "locale";
const SETTING_DEVICE_INSTALL_ID = "device_install_id";

export async function getSetting(key: string): Promise<string | null> {
  const result = await executeSql<{ rows: { length: number; item: (index: number) => { value: string } } }>(
    "SELECT value FROM settings WHERE key = ? LIMIT 1;",
    [key]
  );
  if (result.rows.length > 0) {
    return result.rows.item(0).value;
  }
  return null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await executeSql("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);", [key, value]);
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
