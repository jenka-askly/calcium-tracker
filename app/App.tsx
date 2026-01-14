// Purpose: Bootstrap the Expo app, initialize JSON-backed persistence, and render navigation with diagnostics.
// Persists: Initializes AsyncStorage state and settings through services.
// Security Risks: Handles device_install_id and locale values in memory.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppContextProvider } from "./src/context/AppContext";
import { PhotoCaptureProvider, type PhotoCaptureState } from "./src/context/PhotoCaptureContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { initDatabase } from "./src/services/db";
import { getLocaleSetting, getOrCreateDeviceInstallId, setLocaleSetting } from "./src/services/settings";
import { getDefaultLocale, loadLocalization, type Locale } from "./src/services/i18n";
import { log, span, withTimeout } from "./src/utils/logger";

const BOOT_TIMEOUT_MS = 15000;
const BOOT_WAIT_LOG_MS = 2000;
const STEP_TIMEOUT_MS = {
  dbInit: 8000,
  settings: 4000,
  i18n: 10000
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const [strings, setStrings] = useState<Record<string, string>>({});
  const [deviceInstallId, setDeviceInstallId] = useState("");
  const [uiVersion, setUiVersion] = useState("");
  const [bootError, setBootError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState("boot:start");
  const [navReady, setNavReady] = useState(false);
  const [photo, setPhoto] = useState<PhotoCaptureState | null>(null);
  const bootStartRef = useRef<number>(Date.now());
  const currentStepRef = useRef(currentStep);

  const loadApp = useCallback(async () => {
    const runStep = async <T,>(step: string, work: () => Promise<T>, timeoutMs: number): Promise<T> => {
      setCurrentStep(step);
      log("boot", "step", { step, phase: "start" });
      return span("boot", `step:${step}`, async () => {
        try {
          const result = await withTimeout(work(), timeoutMs, `boot:${step}`);
          log("boot", "step", { step, phase: "end" });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log("boot", "step", { step, phase: "error", message });
          throw error;
        }
      });
    };

    await runStep("db:init", () => initDatabase(), STEP_TIMEOUT_MS.dbInit);
    const defaultLocale = getDefaultLocale();
    const savedLocale = (await runStep(
      "settings:locale",
      () => getLocaleSetting(defaultLocale),
      STEP_TIMEOUT_MS.settings
    )) as Locale;
    const installId = await runStep(
      "settings:device_install_id",
      () => getOrCreateDeviceInstallId(),
      STEP_TIMEOUT_MS.settings
    );
    const localization = await runStep(
      "i18n:load",
      () => loadLocalization(savedLocale),
      STEP_TIMEOUT_MS.i18n
    );
    setLocale(savedLocale);
    setStrings(localization.strings);
    setUiVersion(localization.uiVersion);
    setDeviceInstallId(installId);
    setReady(true);
  }, []);

  useEffect(() => {
    const pkg = require("./package.json");
    log("boot", "start", { ms: 0 });
    log("boot", "deps", {
      app_version: pkg.version,
      expo: pkg.dependencies?.expo,
      react_native: pkg.dependencies?.["react-native"]
    });
    log("boot", "env", {
      node_env: process.env.NODE_ENV,
      dev: __DEV__,
      platform: Platform.OS,
      platform_version: Platform.Version
    });
    span("boot", "initialize", async () => {
      await loadApp();
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log("boot", "error", { message });
      console.error(error);
      setBootError("App failed to finish loading.");
    });
  }, [loadApp]);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

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

  useEffect(() => {
    if (ready) {
      log("boot", "step", { step: "navigation:mount", phase: "start" });
    }
  }, [ready]);

  useEffect(() => {
    if (ready || bootError) {
      return;
    }
    const intervalId = setInterval(() => {
      log("boot", "waiting", { step: currentStep, ready, error: Boolean(bootError) });
    }, BOOT_WAIT_LOG_MS);
    return () => clearInterval(intervalId);
  }, [ready, bootError, currentStep]);

  useEffect(() => {
    if (ready || bootError) {
      return;
    }
    const timeoutId = setTimeout(() => {
      if (!ready && !bootError) {
        log("boot", "timeout", { ms: BOOT_TIMEOUT_MS, step: currentStepRef.current });
        setBootError("App is taking too long to load. Please restart.");
      }
    }, BOOT_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [ready, bootError]);

  useEffect(() => {
    if (ready && navReady) {
      log("boot", "ready", { ms: Date.now() - bootStartRef.current });
    }
  }, [ready, navReady]);

  if (bootError) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Unable to load the app.</Text>
        <Text style={styles.errorText}>{bootError}</Text>
      </SafeAreaView>
    );
  }

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
      <PhotoCaptureProvider value={{ photo, setPhoto }}>
        <AppContextProvider
          value={{
            locale,
            strings,
            deviceInstallId,
            uiVersion,
            setLocale: handleLocaleChange
          }}
        >
          <NavigationContainer
            onReady={() => {
              log("boot", "step", { step: "navigation:mount", phase: "end" });
              setNavReady(true);
            }}
          >
            <RootNavigator />
          </NavigationContainer>
        </AppContextProvider>
      </PhotoCaptureProvider>
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
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24
  }
});
