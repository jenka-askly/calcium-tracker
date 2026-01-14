// Purpose: Provide a placeholder photo review screen with navigation actions.
// Persists: No persistence.
// Security Risks: None.
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { log } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "PhotoReview">;

export function PhotoReviewScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  const handleUsePhoto = useCallback(() => {
    log("photo_review", "use_photo", { action: "navigate_questions" });
    navigation.push("Questions");
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "photo_review_title")}</Text>
      <View style={styles.placeholder} />
      <PrimaryButton
        label={translate(strings, "use_photo")}
        onPress={handleUsePhoto}
      />
      <PrimaryButton
        label={translate(strings, "retake")}
        onPress={() => navigation.goBack()}
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
  placeholder: {
    flex: 1,
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    marginBottom: 20
  },
  secondaryButton: {
    backgroundColor: "#4a5568"
  }
});
