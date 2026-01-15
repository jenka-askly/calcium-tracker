// Purpose: Capture a photo using the device camera and store preview state for review.
// Persists: No persistence; stores capture metadata in memory via context.
// Security Risks: Requests camera permissions and handles local file URIs.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, type CameraViewRef, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { usePhotoCaptureContext } from "../context/PhotoCaptureContext";
import { translate } from "../services/i18n";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { log } from "../utils/logger";
import { createUuidV4 } from "../utils/uuid";

type Props = NativeStackScreenProps<RootStackParamList, "PhotoCapture">;

export function PhotoCaptureScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  const { setPhoto } = usePhotoCaptureContext();
  const cameraRef = useRef<CameraViewRef | null>(null);
  const [permission] = useCameraPermissions();
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

  useEffect(() => {
    // DEBUG TOUCH
    log("photo_capture", "render:capture_button", {
      hasPermission: permission?.granted ?? false,
      isCameraReady: isReady,
      disabled: captureDisabled
    });
    // DEBUG TOUCH
  }, [captureDisabled, isReady, permission?.granted]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "take_photo")}</Text>
      {__DEV__ ? (
        <PrimaryButton
          label="DEBUG: Go To Review"
          onPress={() => {
            log("photo_capture", "debug:navigate_review", {});
            navigation.navigate("PhotoReview");
          }}
        />
      ) : null}
      {/* DEBUG TOUCH */}
      <PrimaryButton
        label="DEBUG CAPTURE"
        onPress={() => {
          log("photo_capture", "capture:debug_button_press", {});
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
          onPress={async () => {
            log("photo_capture", "capture:panic_handler_enter", {});
            log("photo_capture", "capture:handler_enter", {});
            Alert.alert("DEBUG", "capture handler enter");
            // DEBUG TOUCH
            log("photo_capture", "capture:press", {});
            // DEBUG TOUCH
            let watchdogId: ReturnType<typeof setTimeout> | null = null;
            let watchdogSettled = false;
            let didStartCapture = false;

            const clearWatchdog = () => {
              if (watchdogSettled) {
                return;
              }
              watchdogSettled = true;
              if (watchdogId) {
                clearTimeout(watchdogId);
              }
            };

            try {
              const captureId = await createUuidV4();
              log("photo_capture", "capture:id_generated", { captureId });
              const hasPermission = permission?.granted ?? false;
              const isCameraReady = isReady;
              const refPresent = !!cameraRef.current;

              log("photo_capture", "capture:prechecks", {
                hasPermission,
                isCameraReady,
                refPresent
              });

              if (isCapturing) {
                log("photo_capture", "capture:guard_return", {
                  reason: "capture_in_progress"
                });
                Alert.alert("Capture blocked", "capture_in_progress");
                return;
              }

              if (!hasPermission) {
                log("photo_capture", "capture:guard_return", {
                  reason: "permission_missing"
                });
                Alert.alert("Capture blocked", "permission_missing");
                return;
              }

              if (!isCameraReady) {
                log("photo_capture", "capture:guard_return", {
                  reason: "camera_not_ready"
                });
                Alert.alert("Capture blocked", "camera_not_ready");
                return;
              }

              if (!refPresent) {
                log("photo_capture", "capture:guard_return", {
                  reason: "camera_ref_missing"
                });
                Alert.alert("Capture blocked", "camera_ref_missing");
                return;
              }

              setIsCapturing(true);
              didStartCapture = true;
              log("photo_capture", "capture:takePicture_start", {});
              watchdogId = setTimeout(() => {
                if (watchdogSettled) {
                  return;
                }
                watchdogSettled = true;
                log("photo_capture", "capture:hang", {});
                Alert.alert("Capture appears stuck");
              }, 5000);

              const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
              clearWatchdog();

              log("photo_capture", "capture:takePicture_success", {
                uri: photo?.uri ?? null,
                width: photo?.width ?? null,
                height: photo?.height ?? null
              });

              if (!photo?.uri) {
                log("photo_capture", "capture:error", {
                  message: "missing_photo_uri"
                });
                Alert.alert("Capture failed", "missing_photo_uri");
                return;
              }

              const info = await FileSystem.getInfoAsync(photo.uri);
              log("photo_capture", "capture:file_info", {
                exists: info.exists,
                size: info.size ?? null
              });

              const nextPhoto = {
                uri: photo.uri,
                width: photo.width,
                height: photo.height,
                captureId,
                source: "camera" as const
              };

              log("photo_capture", "capture:set_state", {
                uri: nextPhoto.uri,
                width: nextPhoto.width,
                height: nextPhoto.height
              });
              setPhoto(nextPhoto);

              log("photo_capture", "capture:navigate_review", {
                uri: nextPhoto.uri
              });
              navigation.navigate("PhotoReview");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              const stack = error instanceof Error ? error.stack ?? null : null;
              log("photo_capture", "capture:error", { message, stack });
              Alert.alert("Capture failed", message);
            } finally {
              clearWatchdog();
              if (didStartCapture) {
                setIsCapturing(false);
              }
            }
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
