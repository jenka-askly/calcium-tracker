// Purpose: Provide a large, accessible primary button component for the app.
// Persists: No persistence.
// Security Risks: None.
import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onTouchStart?: () => void;
};

export function PrimaryButton({
  label,
  onPress,
  style,
  disabled,
  onPressIn,
  onPressOut,
  onTouchStart
}: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.button, disabled ? styles.disabled : null, style]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onTouchStart={onTouchStart}
      disabled={disabled}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    marginVertical: 8
  },
  label: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600"
  },
  disabled: {
    opacity: 0.6
  }
});
