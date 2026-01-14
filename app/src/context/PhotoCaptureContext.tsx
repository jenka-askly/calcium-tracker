// Purpose: Provide shared in-memory state for the latest photo capture preview.
// Persists: No persistence; data is stored in React state only.
// Security Risks: Holds local file URIs in memory; avoid logging secrets.
import React, { createContext, useContext } from "react";

export type PhotoCaptureState = {
  uri: string;
  width?: number;
  height?: number;
  captureId: string;
  source: "camera" | "debug-remote";
};

export type PhotoCaptureContextValue = {
  photo: PhotoCaptureState | null;
  setPhoto: React.Dispatch<React.SetStateAction<PhotoCaptureState | null>>;
};

const PhotoCaptureContext = createContext<PhotoCaptureContextValue | undefined>(undefined);

export function PhotoCaptureProvider({
  value,
  children
}: {
  value: PhotoCaptureContextValue;
  children: React.ReactNode;
}) {
  return <PhotoCaptureContext.Provider value={value}>{children}</PhotoCaptureContext.Provider>;
}

export function usePhotoCaptureContext(): PhotoCaptureContextValue {
  const context = useContext(PhotoCaptureContext);
  if (!context) {
    throw new Error("PhotoCaptureContext missing");
  }
  return context;
}
