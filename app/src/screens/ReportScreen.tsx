// Purpose: Display a placeholder 30-day report with actions.
// Persists: No persistence.
// Security Risks: None.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Report">;

export function ReportScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "report_title")}</Text>
      <View style={styles.listItem}>
        <Text style={styles.listText}>2024-04-01 - 650 mg</Text>
      </View>
      <View style={styles.listItem}>
        <Text style={styles.listText}>2024-03-31 - 540 mg</Text>
      </View>
      <PrimaryButton label={translate(strings, "export_csv")} onPress={() => null} />
      <PrimaryButton
        label={translate(strings, "suggestion_title")}
        onPress={() => navigation.navigate("Suggestion")}
        style={styles.secondaryButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e0"
  },
  listText: {
    fontSize: 18
  },
  secondaryButton: {
    backgroundColor: "#4a5568"
  }
});
