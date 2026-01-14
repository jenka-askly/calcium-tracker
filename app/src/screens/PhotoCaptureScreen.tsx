// Purpose: Capture a photo using the device camera and store preview state for review.
// Persists: No persistence; stores capture metadata in memory via context.
// Security Risks: Requests camera permissions and handles local file URIs.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, type CameraViewRef, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { v4 as uuidv4 } from "uuid";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { usePhotoCaptureContext } from "../context/PhotoCaptureContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { log } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "PhotoCapture">;

export function PhotoCaptureScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  const { setPhoto } = usePhotoCaptureContext();
  const cameraRef = useRef<CameraViewRef | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    // DEBUG PHOTO PIPELINE
    log("photo_capture", "permission_status", {
      phase: "initial",
      status: permission?.status ?? "unknown",
      granted: permission?.granted ?? false
    });
    // DEBUG PHOTO PIPELINE
  }, [permission?.granted, permission?.status]);

  const handleCameraReady = useCallback(() => {
    setIsReady(true);
    // DEBUG PHOTO PIPELINE
    log("photo_capture", "camera_ready", { ready: true });
    // DEBUG PHOTO PIPELINE
  }, []);

  const handleCapture = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    const captureId = uuidv4();
    setIsCapturing(true);

    try {
      // DEBUG PHOTO PIPELINE
      const beforeStatus = permission?.status ?? "unknown";
      log("photo_capture", "permission_status", {
        capture_id: captureId,
        phase: "before_request",
        status: beforeStatus,
        granted: permission?.granted ?? false
      });
      // DEBUG PHOTO PIPELINE

      let afterStatus = beforeStatus;
      let afterGranted = permission?.granted ?? false;
      if (!permission?.granted) {
        const response = await requestPermission();
        afterStatus = response.status;
        afterGranted = response.granted;
      }

      // DEBUG PHOTO PIPELINE
      log("photo_capture", "permission_status", {
        capture_id: captureId,
        phase: "after_request",
        status: afterStatus,
        granted: afterGranted
      });
      // DEBUG PHOTO PIPELINE

      if (!afterGranted) {
        // DEBUG PHOTO PIPELINE
        log("photo_capture", "capture_blocked", {
          capture_id: captureId,
          reason: "permission_denied"
        });
        // DEBUG PHOTO PIPELINE
        return;
      }

      if (!cameraRef.current) {
        // DEBUG PHOTO PIPELINE
        log("photo_capture", "capture_error", {
          capture_id: captureId,
          message: "camera_ref_missing"
        });
        // DEBUG PHOTO PIPELINE
        return;
      }

      const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });

      // DEBUG PHOTO PIPELINE
      log("photo_capture", "capture_result", {
        capture_id: captureId,
        uri: result.uri,
        width: result.width,
        height: result.height
      });
      // DEBUG PHOTO PIPELINE

      const info = await FileSystem.getInfoAsync(result.uri);

      // DEBUG PHOTO PIPELINE
      log("photo_capture", "file_info", {
        capture_id: captureId,
        uri: result.uri,
        exists: info.exists,
        size: info.size ?? null
      });
      // DEBUG PHOTO PIPELINE

      const nextPhoto = {
        uri: result.uri,
        width: result.width,
        height: result.height,
        captureId,
        source: "camera" as const
      };

      // DEBUG PHOTO PIPELINE
      log("photo_capture", "state_store", {
        capture_id: captureId,
        uri: nextPhoto.uri,
        width: nextPhoto.width,
        height: nextPhoto.height,
        source: nextPhoto.source
      });
      // DEBUG PHOTO PIPELINE

      setPhoto(nextPhoto);
      navigation.navigate("PhotoReview");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // DEBUG PHOTO PIPELINE
      log("photo_capture", "capture_error", { capture_id: captureId, message });
      // DEBUG PHOTO PIPELINE
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, navigation, permission, requestPermission, setPhoto]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "take_photo")}</Text>
      <View style={styles.cameraFrame}>
        {permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={handleCameraReady}
          />
        ) : (
          <View style={styles.permissionFallback}>
            <Text style={styles.permissionText}>{translate(strings, "camera_permission")}</Text>
          </View>
        )}
      </View>
      <PrimaryButton
        label={translate(strings, "capture_photo")}
        onPress={handleCapture}
        disabled={isCapturing || (permission?.granted ? !isReady : false)}
      />
      {isCapturing ? <ActivityIndicator style={styles.loading} /> : null}
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
  cameraFrame: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1a202c",
    marginBottom: 20
  },
  camera: {
    flex: 1
  },
  permissionFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16
  },
  permissionText: {
    color: "#e2e8f0",
    fontSize: 16,
    textAlign: "center"
  },
  loading: {
    marginTop: 12
  }
});
