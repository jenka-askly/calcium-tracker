// Purpose: Provide the Home/Capture screen with primary navigation actions.
// Persists: No persistence.
// Security Risks: Reads status from the backend without logging sensitive data.
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppContext } from "../context/AppContext";
import { PrimaryButton } from "../components/PrimaryButton";
import { translate, SUPPORTED_LOCALES, type Locale } from "../services/i18n";
import { getStatus } from "../services/apiClient";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { strings, locale, setLocale } = useAppContext();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getStatus()
      .then((status) => {
        if (active && !status.estimation_enabled) {
          setStatusMessage(status.message || translate(strings, "estimation_disabled_banner"));
        }
      })
      .catch(() => {
        if (active) {
          setStatusMessage(null);
        }
      });
    return () => {
      active = false;
    };
  }, [strings]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "home_title")}</Text>
      {statusMessage ? <Text style={styles.banner}>{statusMessage}</Text> : null}
      <PrimaryButton
        label={translate(strings, "take_photo")}
        onPress={() => navigation.navigate("PhotoCapture")}
      />
      <PrimaryButton
        label={translate(strings, "report_30_days")}
        onPress={() => navigation.navigate("Report")}
        style={styles.secondaryButton}
      />
      <View style={styles.localeContainer}>
        <Text style={styles.localeLabel}>{translate(strings, "language")}</Text>
        <View style={styles.localeButtons}>
          {SUPPORTED_LOCALES.map((item) => (
            <PrimaryButton
              key={item}
              label={item}
              onPress={() => setLocale(item as Locale)}
              style={item === locale ? styles.localeActive : styles.localeButton}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 20
  },
  banner: {
    backgroundColor: "#fed7d7",
    color: "#822727",
    padding: 12,
    borderRadius: 10,
    fontSize: 18,
    marginBottom: 12
  },
  secondaryButton: {
    backgroundColor: "#4a5568"
  },
  localeContainer: {
    marginTop: 16
  },
  localeLabel: {
    fontSize: 20,
    marginBottom: 8
  },
  localeButtons: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  localeButton: {
    backgroundColor: "#2d3748",
    marginRight: 8
  },
  localeActive: {
    backgroundColor: "#38a169",
    marginRight: 8
  }
});
