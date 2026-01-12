// Purpose: Provide app-wide state for localization and device settings.
// Persists: Reads from SQLite settings via consumers.
// Security Risks: Carries device_install_id in memory; avoid logging raw values.
import React, { createContext, useContext } from "react";

import type { Locale } from "../services/i18n";

export type AppContextValue = {
  locale: Locale;
  strings: Record<string, string>;
  deviceInstallId: string;
  uiVersion: string;
  setLocale: (locale: Locale) => Promise<void>;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({
  value,
  children
}: {
  value: AppContextValue;
  children: React.ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("AppContext missing");
  }
  return context;
}
