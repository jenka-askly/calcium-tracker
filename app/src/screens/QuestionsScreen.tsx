// Purpose: Collect the three required estimation questions with large-button options.
// Persists: No persistence.
// Security Risks: None.
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Questions">;

export function QuestionsScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  const [portionSize, setPortionSize] = useState<string | null>(null);
  const [containsDairy, setContainsDairy] = useState<string | null>(null);
  const [containsTofu, setContainsTofu] = useState<string | null>(null);

  const canContinue = Boolean(portionSize && containsDairy && containsTofu);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "questions_title")}</Text>

      <Text style={styles.questionLabel}>{translate(strings, "question_portion_size")}</Text>
      <View style={styles.optionRow}>
        {["portion_small", "portion_medium", "portion_large"].map((key) => (
          <PrimaryButton
            key={key}
            label={translate(strings, key)}
            onPress={() => setPortionSize(key)}
            style={portionSize === key ? styles.optionSelected : styles.optionButton}
          />
        ))}
      </View>

      <Text style={styles.questionLabel}>{translate(strings, "question_contains_dairy")}</Text>
      <View style={styles.optionRow}>
        {["yes", "no", "not_sure"].map((key) => (
          <PrimaryButton
            key={key}
            label={translate(strings, key)}
            onPress={() => setContainsDairy(key)}
            style={containsDairy === key ? styles.optionSelected : styles.optionButton}
          />
        ))}
      </View>

      <Text style={styles.questionLabel}>{translate(strings, "question_contains_tofu")}</Text>
      <View style={styles.optionRow}>
        {["yes", "no", "not_sure"].map((key) => (
          <PrimaryButton
            key={key}
            label={translate(strings, key)}
            onPress={() => setContainsTofu(key)}
            style={containsTofu === key ? styles.optionSelected : styles.optionButton}
          />
        ))}
      </View>

      <PrimaryButton
        label={translate(strings, "result_title")}
        onPress={() => navigation.navigate("Result")}
        disabled={!canContinue}
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
  questionLabel: {
    fontSize: 20,
    marginTop: 16
  },
  optionRow: {
    marginBottom: 8
  },
  optionButton: {
    backgroundColor: "#2d3748"
  },
  optionSelected: {
    backgroundColor: "#38a169"
  }
});
