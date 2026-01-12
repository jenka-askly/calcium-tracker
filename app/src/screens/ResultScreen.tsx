// Purpose: Display a placeholder calcium estimate result and actions.
// Persists: No persistence.
// Security Risks: None.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

export function ResultScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "result_title")}</Text>
      <Text style={styles.value}>{translate(strings, "calcium_label")}: 300 mg</Text>
      <Text style={styles.confidence}>{translate(strings, "confidence_medium")}</Text>
      <PrimaryButton label={translate(strings, "save")} onPress={() => navigation.navigate("Today")} />
      <PrimaryButton
        label={translate(strings, "retake")}
        onPress={() => navigation.navigate("Home")}
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
    marginBottom: 16
  },
  value: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 12
  },
  confidence: {
    fontSize: 20,
    marginBottom: 20
  },
  secondaryButton: {
    backgroundColor: "#4a5568"
  }
});
