// Purpose: Collect estimation questions, show diagnostics for missing question data, and allow fail-open progress.
// Persists: No persistence.
// Security Risks: Handles local photo metadata for submission and logging without exposing PII.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import type { QuestionDefinition } from "../types/questions";
import { error as logError, log } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "Questions">;

const DEFAULT_QUESTIONS: QuestionDefinition[] = [
  {
    id: "portion_size",
    labelKey: "question_portion_size",
    options: [
      { id: "portion_small", labelKey: "portion_small" },
      { id: "portion_medium", labelKey: "portion_medium" },
      { id: "portion_large", labelKey: "portion_large" }
    ]
  },
  {
    id: "contains_dairy",
    labelKey: "question_contains_dairy",
    options: [
      { id: "yes", labelKey: "yes" },
      { id: "no", labelKey: "no" },
      { id: "not_sure", labelKey: "not_sure" }
    ]
  },
  {
    id: "contains_tofu_or_small_fish_bones",
    labelKey: "question_contains_tofu",
    options: [
      { id: "yes", labelKey: "yes" },
      { id: "no", labelKey: "no" },
      { id: "not_sure", labelKey: "not_sure" }
    ]
  }
];

export function QuestionsScreen({ navigation, route }: Props) {
  const { strings, locale, deviceInstallId, uiVersion } = useAppContext();
  const { photo } = usePhotoCaptureContext();
  const [portionSize, setPortionSize] = useState<string | null>(null);
  const [containsDairy, setContainsDairy] = useState<string | null>(null);
  const [containsTofu, setContainsTofu] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questions, setQuestions] = useState<QuestionDefinition[]>(DEFAULT_QUESTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoggedScroll = useRef(false);
  const lastRenderLog = useRef<string | null>(null);
  const photoUri = photo?.uri ?? null;
  const captureId = photo?.captureId ?? null;

  const questionsCount = useMemo(() => questions?.length ?? 0, [questions]);
  const disabledReasons = useMemo(() => {
    const reasons: string[] = [];
    if (loading) reasons.push("loading");
    if (!photoUri) reasons.push("missing_photo_uri");
    if (!captureId) reasons.push("missing_capture_id");
    if (questionsCount === 0) reasons.push("no_questions");
    if (error) reasons.push(`error:${String(error)}`);
    return reasons;
  }, [captureId, error, loading, photoUri, questionsCount]);

  const canProceed = useMemo(() => {
    if (!loading && questionsCount === 0) {
      return true;
    }
    return Boolean(portionSize && containsDairy && containsTofu);
  }, [containsDairy, containsTofu, loading, portionSize, questionsCount]);

  const loadQuestions = useCallback(() => {
    setLoading(true);
    setError(null);
    const routeQuestions = route.params?.questions;
    log("questions", "route_params_questions", {
      count: routeQuestions?.length ?? 0
    });
    if (!routeQuestions || routeQuestions.length === 0) {
      setError("missing_questions_params");
      setQuestions((prev) => (DEFAULT_QUESTIONS.length ? DEFAULT_QUESTIONS : prev));
    } else {
      setQuestions((prev) => (routeQuestions.length ? routeQuestions : prev));
    }
    setLoading(false);
  }, [route.params?.questions]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    const renderState = {
      loading,
      error: error ? String(error) : null,
      questionsCount,
      questionIds: (questions ?? [])
        .map((question) => question.id ?? question.key ?? question.slug ?? question.labelKey)
        .slice(0, 10),
      hasPhotoUri: !!photoUri,
      captureIdPresent: !!captureId,
      disabledReasons,
      routeParamsKeys: Object.keys(route.params ?? {})
    };
    const signature = JSON.stringify(renderState);
    if (lastRenderLog.current === signature) {
      return;
    }
    lastRenderLog.current = signature;
    log("questions", "render_state", renderState);
  }, [
    captureId,
    disabledReasons,
    error,
    loading,
    photoUri,
    questions,
    questionsCount,
    route.params
  ]);

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
    if (!photoUri) {
      Alert.alert("Photo missing", "Please retake the photo before continuing.");
      navigation.goBack();
      return;
    }

    if (!canProceed) {
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
    canProceed,
    containsDairy,
    containsTofu,
    deviceInstallId,
    isSubmitting,
    locale,
    navigation,
    photo,
    photoUri,
    portionSize,
    showErrorAlert,
    uiVersion
  ]);

  const handleScrollBeginDrag = useCallback(() => {
    if (hasLoggedScroll.current) {
      return;
    }
    hasLoggedScroll.current = true;
    log("questions", "scroll", { question_count: questionsCount });
  }, [questionsCount]);

  const handleRetry = useCallback(() => {
    log("questions", "retry_pressed", { disabled_reasons: disabledReasons });
    loadQuestions();
  }, [disabledReasons, loadQuestions]);

  const handleContinueWithoutQuestions = useCallback(() => {
    log("questions", "continue_without_questions_pressed", {
      disabled_reasons: disabledReasons
    });
    void handleSubmit();
  }, [disabledReasons, handleSubmit]);

  const getAnswerState = useCallback(
    (questionId: string) => {
      switch (questionId) {
        case "portion_size":
          return { value: portionSize, onChange: setPortionSize };
        case "contains_dairy":
          return { value: containsDairy, onChange: setContainsDairy };
        case "contains_tofu_or_small_fish_bones":
          return { value: containsTofu, onChange: setContainsTofu };
        default:
          return { value: null, onChange: () => {} };
      }
    },
    [containsDairy, containsTofu, portionSize]
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.panel}>
          <Text style={styles.title}>{translate(strings, "questions_title")}</Text>

          {!loading && questionsCount === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No questions loaded</Text>
              <Text style={styles.emptySubtitle}>{disabledReasons.join(", ")}</Text>
              <View style={styles.emptyButtons}>
                <PrimaryButton label="Retry" onPress={handleRetry} />
                <PrimaryButton
                  label="Continue"
                  onPress={handleContinueWithoutQuestions}
                  style={styles.secondaryButton}
                />
              </View>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={handleScrollBeginDrag}
            >
              {questions.map((question) => {
                const answerState = getAnswerState(question.id);
                return (
                  <View key={question.id} style={styles.questionBlock}>
                    <Text style={styles.questionLabel}>
                      {translate(strings, question.labelKey)}
                    </Text>
                    <View style={styles.optionRow}>
                      {question.options.map((option) => (
                        <PrimaryButton
                          key={option.id}
                          label={translate(strings, option.labelKey)}
                          onPress={() => answerState.onChange(option.id)}
                          style={
                            answerState.value === option.id
                              ? styles.optionSelected
                              : styles.optionButton
                          }
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <PrimaryButton
              label={translate(strings, "back")}
              onPress={() => navigation.goBack()}
              style={styles.footerButton}
            />
            <PrimaryButton
              label={translate(strings, "next")}
              onPress={handleSubmit}
              disabled={!canProceed || isSubmitting}
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
    maxHeight: "85%",
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
  questionBlock: {
    marginBottom: 8
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
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#4a5568",
    textAlign: "center",
    marginBottom: 16
  },
  emptyButtons: {
    width: "100%",
    gap: 12
  },
  secondaryButton: {
    backgroundColor: "#4a5568"
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
