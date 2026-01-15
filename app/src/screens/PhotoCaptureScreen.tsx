// Purpose: Capture a photo using the device camera and store preview state for review.
// Persists: No persistence; stores capture metadata in memory via context.
// Security Risks: Requests camera permissions and handles local file URIs.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from "react-native";
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
  const captureDisabled = isCapturing;

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
    const captureId = uuidv4();
    // DEBUG CAPTURE
    log("camera", "capture:press", { captureId });
    Alert.alert("Capture pressed", captureId);
    const appState = AppState.currentState ?? "unknown";
    log("camera", "capture:state", {
      captureId,
      hasPermission: permission?.granted ?? false,
      permissionStatus: permission?.status ?? "unknown",
      cameraRefPresent: !!cameraRef.current,
      isCameraReady: isReady,
      appState
    });
    // DEBUG CAPTURE

    if (isCapturing) {
      log("camera", "capture:blocked", {
        captureId,
        reason: "capture_in_progress"
      });
      return;
    }

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
        // DEBUG CAPTURE
        Alert.alert("Camera permission missing");
        log("camera", "capture:blocked", {
          captureId,
          reason: "permission_missing"
        });
        // DEBUG CAPTURE
        // DEBUG PHOTO PIPELINE
        log("photo_capture", "capture_blocked", {
          capture_id: captureId,
          reason: "permission_denied"
        });
        // DEBUG PHOTO PIPELINE
        return;
      }

      if (!cameraRef.current) {
        // DEBUG CAPTURE
        Alert.alert("Camera not mounted (ref null)");
        log("camera", "capture:blocked", {
          captureId,
          reason: "camera_ref_missing"
        });
        // DEBUG CAPTURE
        // DEBUG PHOTO PIPELINE
        log("photo_capture", "capture_error", {
          capture_id: captureId,
          message: "camera_ref_missing"
        });
        // DEBUG PHOTO PIPELINE
        return;
      }

      if (!isReady) {
        // DEBUG CAPTURE
        Alert.alert("Camera not ready yet");
        log("camera", "capture:blocked", {
          captureId,
          reason: "camera_not_ready"
        });
        // DEBUG CAPTURE
        return;
      }

      let watchdogFired = false;
      const watchdogId = setTimeout(() => {
        watchdogFired = true;
        // DEBUG CAPTURE
        log("camera", "capture:hang", { captureId });
        Alert.alert("Capture appears hung");
        // DEBUG CAPTURE
      }, 3000);

      try {
        // DEBUG CAPTURE
        log("camera", "capture:start", { captureId });
        // DEBUG CAPTURE
        const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });

        if (!watchdogFired) {
          clearTimeout(watchdogId);
        }

        // DEBUG CAPTURE
        log("camera", "capture:success", {
          captureId,
          uri: result.uri,
          width: result.width,
          height: result.height
        });
        // DEBUG CAPTURE

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
        if (!watchdogFired) {
          clearTimeout(watchdogId);
        }
        const message = error instanceof Error ? error.message : String(error);
        // DEBUG CAPTURE
        log("camera", "capture:error", { captureId, message });
        Alert.alert("Capture failed", message);
        // DEBUG CAPTURE
        // DEBUG PHOTO PIPELINE
        log("photo_capture", "capture_error", { capture_id: captureId, message });
        // DEBUG PHOTO PIPELINE
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // DEBUG PHOTO PIPELINE
      log("photo_capture", "capture_error", { capture_id: captureId, message });
      // DEBUG PHOTO PIPELINE
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, isReady, navigation, permission, requestPermission, setPhoto]);

  useEffect(() => {
    // DEBUG TOUCH
    log("photo_capture", "render:capture_button", {
      hasPermission: permission?.granted ?? false,
      isCameraReady: isReady,
      disabled: captureDisabled,
      onPressType: typeof handleCapture
    });
    // DEBUG TOUCH
  }, [captureDisabled, handleCapture, isReady, permission?.granted]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "take_photo")}</Text>
      {/* DEBUG TOUCH */}
      <PrimaryButton
        label="DEBUG CAPTURE"
        onPress={() => {
          log("photo_capture", "capture:debug_button_press", {});
          handleCapture();
        }}
      />
      {/* DEBUG TOUCH */}
      <View
        style={styles.cameraFrame}
        pointerEvents="box-none"
        onTouchStart={() => {
          // DEBUG TOUCH
          log("photo_capture", "preview:touch_start", {});
          // DEBUG TOUCH
        }}
        onStartShouldSetResponder={() => {
          // DEBUG TOUCH
          log("photo_capture", "preview:responder_granted", {});
          // DEBUG TOUCH
          return true;
        }}
      >
        {permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={handleCameraReady}
            onMountError={(event) => {
              log("camera", "mount_error", {
                message: event.nativeEvent.message
              });
            }}
          />
        ) : (
          <View style={styles.permissionFallback}>
            <Text style={styles.permissionText}>{translate(strings, "camera_permission")}</Text>
          </View>
        )}
      </View>
      <View style={styles.captureContainer} pointerEvents="box-none">
        <PrimaryButton
          label={translate(strings, "capture_photo")}
          onPress={() => {
            // DEBUG TOUCH
            log("photo_capture", "capture:press", {});
            // DEBUG TOUCH
            handleCapture();
          }}
          onPressIn={() => {
            // DEBUG TOUCH
            log("photo_capture", "capture:press_in", {});
            // DEBUG TOUCH
          }}
          onPressOut={() => {
            // DEBUG TOUCH
            log("photo_capture", "capture:press_out", {});
            // DEBUG TOUCH
          }}
          onTouchStart={() => {
            // DEBUG TOUCH
            log("photo_capture", "capture:touch_start", {});
            // DEBUG TOUCH
          }}
          disabled={captureDisabled}
          style={styles.captureButton}
        />
      </View>
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
  captureContainer: {
    // DEBUG TOUCH
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    zIndex: 9999,
    elevation: 9999,
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(255, 0, 0, 0.2)"
    // DEBUG TOUCH
  },
  captureButton: {
    width: "100%"
  },
  loading: {
    marginTop: 12
  }
});
