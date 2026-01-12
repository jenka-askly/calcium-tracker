// Purpose: Bootstrap the Expo app, initialize persistence, and render navigation.
// Persists: Initializes SQLite tables and settings through services.
// Security Risks: Handles device_install_id and locale values in memory.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppContextProvider } from "./src/context/AppContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { initDatabase } from "./src/services/db";
import { getLocaleSetting, getOrCreateDeviceInstallId, setLocaleSetting } from "./src/services/settings";
import { getDefaultLocale, loadLocalization, type Locale } from "./src/services/i18n";

export default function App() {
  const [ready, setReady] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const [strings, setStrings] = useState<Record<string, string>>({});
  const [deviceInstallId, setDeviceInstallId] = useState("");
  const [uiVersion, setUiVersion] = useState("");

  const loadApp = useCallback(async () => {
    await initDatabase();
    const defaultLocale = getDefaultLocale();
    const savedLocale = (await getLocaleSetting(defaultLocale)) as Locale;
    const installId = await getOrCreateDeviceInstallId();
    const localization = await loadLocalization(savedLocale);
    setLocale(savedLocale);
    setStrings(localization.strings);
    setUiVersion(localization.uiVersion);
    setDeviceInstallId(installId);
    setReady(true);
  }, []);

  useEffect(() => {
    loadApp();
  }, [loadApp]);

  const handleLocaleChange = useCallback(
    async (nextLocale: Locale) => {
      await setLocaleSetting(nextLocale);
      const localization = await loadLocalization(nextLocale);
      setLocale(nextLocale);
      setStrings(localization.strings);
      setUiVersion(localization.uiVersion);
    },
    []
  );

  if (!ready) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaProvider>
      <AppContextProvider
        value={{
          locale,
          strings,
          deviceInstallId,
          uiVersion,
          setLocale: handleLocaleChange
        }}
      >
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppContextProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: 12,
    fontSize: 18
  }
});
