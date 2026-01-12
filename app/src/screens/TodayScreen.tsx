// Purpose: Show today's total and a placeholder list of meals.
// Persists: No persistence.
// Security Risks: None.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Today">;

export function TodayScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "today_title")}</Text>
      <Text style={styles.total}>600 mg</Text>
      <View style={styles.listItem}>
        <Text style={styles.listText}>08:30 - 300 mg</Text>
      </View>
      <View style={styles.listItem}>
        <Text style={styles.listText}>12:15 - 300 mg</Text>
      </View>
      <PrimaryButton
        label={translate(strings, "take_photo")}
        onPress={() => navigation.navigate("Home")}
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
  total: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 16
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e0"
  },
  listText: {
    fontSize: 18
  }
});
