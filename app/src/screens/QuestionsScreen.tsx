// Purpose: Collect the three required estimation questions with large-button options.
// Persists: No persistence.
// Security Risks: None.
import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { usePhotoCaptureContext } from "../context/PhotoCaptureContext";
import {
  estimateCalcium,
  type ApiClientError,
  isApiClientError,
  type PortionSize,
  type YesNoNotSure
} from "../services/apiClient";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { error as logError, log } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "Questions">;

export function QuestionsScreen({ navigation }: Props) {
  const { strings, locale, deviceInstallId, uiVersion } = useAppContext();
  const { photo } = usePhotoCaptureContext();
  const [portionSize, setPortionSize] = useState<string | null>(null);
  const [containsDairy, setContainsDairy] = useState<string | null>(null);
  const [containsTofu, setContainsTofu] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canContinue = Boolean(portionSize && containsDairy && containsTofu);

  const showErrorAlert = useCallback(
    (error: ApiClientError, onRetry: () => void) => {
      const baseMessage = `${error.messageUser}\n\nError code: ${error.traceId}`;
      const actions = [
        {
          text: "Try Again",
          onPress: onRetry
        },
        {
          text: "Cancel",
          style: "cancel" as const,
          onPress: () => navigation.goBack()
        }
      ];

      if (__DEV__) {
        actions.splice(1, 0, {
          text: "Details",
          onPress: () => {
            const details = [
              `URL: ${error.url}`,
              `Status: ${error.status ?? "n/a"}`,
              `Method: ${error.method}`
            ].join("\n");
            Alert.alert("Details", details);
          }
        });
      }

      Alert.alert("Unable to continue", baseMessage, actions);
    },
    [navigation]
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (!photo?.uri) {
      Alert.alert("Photo missing", "Please retake the photo before continuing.");
      navigation.goBack();
      return;
    }

    if (!canContinue) {
      return;
    }

    setIsSubmitting(true);
    try {
      const imageBase64 = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64
      });
      const portionMap: Record<string, PortionSize> = {
        portion_small: "small",
        portion_medium: "medium",
        portion_large: "large"
      };
      const yesNoMap: Record<string, YesNoNotSure> = {
        yes: "yes",
        no: "no",
        not_sure: "not_sure"
      };

      const request = {
        image_base64: imageBase64,
        image_mime: "image/jpeg" as const,
        answers: {
          portion_size: portionMap[portionSize ?? "portion_medium"],
          contains_dairy: yesNoMap[containsDairy ?? "not_sure"],
          contains_tofu_or_small_fish_bones: yesNoMap[containsTofu ?? "not_sure"]
        },
        locale,
        ui_version: uiVersion
      };

      log("photo_flow", "estimate_start", {
        capture_id: photo.captureId,
        source: photo.source
      });
      await estimateCalcium(deviceInstallId, request);
      navigation.navigate("Result");
    } catch (error) {
      if (isApiClientError(error)) {
        logError("photo_flow", "estimate_error", {
          kind: error.kind,
          url: error.url,
          status: error.status ?? null,
          message: error.messageDev,
          trace_id: error.traceId
        });
        showErrorAlert(error, () => {
          void handleSubmit();
        });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        logError("photo_flow", "estimate_error_unknown", { message });
        Alert.alert(
          "Unable to continue",
          `Something went wrong. Please try again.\n\nError code: unknown`,
          [
            {
              text: "Try Again",
              onPress: () => {
                void handleSubmit();
              }
            },
            {
              text: "Cancel",
              style: "cancel" as const,
              onPress: () => navigation.goBack()
            }
          ]
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canContinue,
    containsDairy,
    containsTofu,
    deviceInstallId,
    isSubmitting,
    locale,
    navigation,
    photo,
    portionSize,
    showErrorAlert,
    uiVersion
  ]);

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
        onPress={handleSubmit}
        disabled={!canContinue || isSubmitting}
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
