// Purpose: Collect the three required estimation questions with large-button options and verify backend readiness.
// Persists: No persistence.
// Security Risks: None.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { usePhotoCaptureContext } from "../context/PhotoCaptureContext";
import {
  estimateCalcium,
  getStatus,
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
  const hasLoggedScroll = useRef(false);
  const questionCount = 3;
  const panelMaxHeight = Math.round(Dimensions.get("window").height * 0.85);

  const canContinue = Boolean(portionSize && containsDairy && containsTofu);

  useEffect(() => {
    log("questions", "render", { question_count: questionCount });
  }, [questionCount]);

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
      log("photo_flow", "status_check_start", {
        capture_id: photo.captureId,
        source: photo.source
      });
      try {
        await getStatus();
        log("photo_flow", "status_check_ok", {
          capture_id: photo.captureId,
          source: photo.source
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isApiClientError(error)) {
          logError("photo_flow", "status_check_error", {
            kind: error.kind,
            url: error.url,
            status: error.status ?? null,
            message: error.messageDev,
            trace_id: error.traceId
          });
        } else {
          logError("photo_flow", "status_check_error_unknown", { message });
        }
        Alert.alert(
          "Can’t reach server. Make sure the backend is running and connected to the same Wi-Fi."
        );
        return;
      }

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
      log("photo_flow", "capture:api_call_start", {
        capture_id: photo.captureId,
        endpoint: "/api/estimateCalcium"
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

  const handleScrollBeginDrag = useCallback(() => {
    if (hasLoggedScroll.current) {
      return;
    }
    hasLoggedScroll.current = true;
    log("questions", "scroll", { question_count: questionCount });
  }, [questionCount]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.panel, { maxHeight: panelMaxHeight }]}>
          <Text style={styles.title}>{translate(strings, "questions_title")}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={handleScrollBeginDrag}
          >
            <Text style={styles.questionLabel}>
              {translate(strings, "question_portion_size")}
            </Text>
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

            <Text style={styles.questionLabel}>
              {translate(strings, "question_contains_dairy")}
            </Text>
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

            <Text style={styles.questionLabel}>
              {translate(strings, "question_contains_tofu")}
            </Text>
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
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton
              label={translate(strings, "back")}
              onPress={() => navigation.goBack()}
              style={styles.footerButton}
            />
            <PrimaryButton
              label={translate(strings, "next")}
              onPress={handleSubmit}
              disabled={!canContinue || isSubmitting}
              style={styles.footerButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f7fafc"
  },
  keyboardAvoiding: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center"
  },
  panel: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    flexShrink: 1,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: 24
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
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 12
  },
  footerButton: {
    flex: 1
  }
});
