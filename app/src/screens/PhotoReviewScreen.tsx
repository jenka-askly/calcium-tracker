// Purpose: Provide a photo review screen with preview rendering and navigation actions.
// Persists: No persistence; reads preview data from in-memory context.
// Security Risks: Renders local or remote image URIs for preview.
import React, { useCallback } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { v4 as uuidv4 } from "uuid";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { usePhotoCaptureContext } from "../context/PhotoCaptureContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { error as logError, log } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "PhotoReview">;

export function PhotoReviewScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  const { photo, setPhoto } = usePhotoCaptureContext();
  const uri = photo?.uri ?? null;
  const captureId = photo?.captureId ?? null;
  log("photo_review", "render", { uri, hasUri: !!uri });
  const handleUsePhoto = useCallback(() => {
    if (!captureId || !uri) {
      logError("photo_review", "navigate_blocked_missing_data", {
        captureId,
        photoUri: uri
      });
      return;
    }
    log("photo_review", "use_photo", { action: "navigate_questions" });
    navigation.navigate("Questions", {
      captureId,
      photoUri: uri
    });
  }, [captureId, navigation, uri]);

  const handleDebugPreview = useCallback(() => {
    const captureId = uuidv4();
    const uri = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80";
    // DEBUG PHOTO PIPELINE
    log("photo_review", "state_store", {
      capture_id: captureId,
      uri,
      source: "debug-remote"
    });
    // DEBUG PHOTO PIPELINE
    setPhoto({ uri, captureId, source: "debug-remote" });
  }, [setPhoto]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "photo_review_title")}</Text>
      <View style={styles.previewFrame}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.previewImage}
            resizeMode="cover"
            onLoad={(event) => {
              // DEBUG PHOTO PIPELINE
              log("photo_review", "image_load", {
                capture_id: photo.captureId,
                source: photo.source,
                width: event.nativeEvent.source.width,
                height: event.nativeEvent.source.height
              });
              // DEBUG PHOTO PIPELINE
            }}
            onError={(event) => {
              // DEBUG PHOTO PIPELINE
              log("photo_review", "image_error", {
                capture_id: photo?.captureId ?? null,
                source: photo?.source ?? null,
                error: event.nativeEvent.error
              });
              // DEBUG PHOTO PIPELINE
            }}
          />
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
      <PrimaryButton
        label={translate(strings, "use_photo")}
        onPress={handleUsePhoto}
      />
      {/* DEBUG PHOTO PIPELINE */}
      <PrimaryButton
        label={translate(strings, "debug_preview")}
        onPress={handleDebugPreview}
        style={styles.debugButton}
      />
      {/* DEBUG PHOTO PIPELINE */}
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
  previewFrame: {
    flex: 1,
    borderRadius: 12,
    marginBottom: 20,
    overflow: "hidden",
    backgroundColor: "#e2e8f0"
  },
  previewImage: {
    width: "100%",
    height: "100%"
  },
  placeholder: {
    flex: 1,
    backgroundColor: "#e2e8f0"
  },
  debugButton: {
    backgroundColor: "#718096"
  },
  secondaryButton: {
    backgroundColor: "#4a5568"
  }
});
