// Purpose: Allow users to submit suggestions with optional diagnostics.
// Persists: No persistence.
// Security Risks: Sends user-entered text to backend; avoid logging raw content.
import React, { useState } from "react";
import { Alert, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { useAppContext } from "../context/AppContext";
import { translate } from "../services/i18n";
import { sendSuggestion } from "../services/apiClient";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Suggestion">;

export function SuggestionScreen({ navigation }: Props) {
  const { strings } = useAppContext();
  const [category, setCategory] = useState<"bug" | "feature" | "confusing">("bug");
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    const response = await sendSuggestion({
      category,
      message,
      include_diagnostics: includeDiagnostics
    });
    setSending(false);
    if (response.ok) {
      Alert.alert(
        translate(strings, "sent_title"),
        translate(strings, "sent_message")
      );
      navigation.goBack();
    } else {
      Alert.alert(
        translate(strings, "error_title"),
        translate(strings, "send_error_message")
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate(strings, "suggestion_title")}</Text>
      <View style={styles.optionRow}>
        {["bug", "feature", "confusing"].map((item) => (
          <PrimaryButton
            key={item}
            label={item}
            onPress={() => setCategory(item as "bug" | "feature" | "confusing")}
            style={category === item ? styles.optionSelected : styles.optionButton}
          />
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder={translate(strings, "optional_message")}
        value={message}
        onChangeText={setMessage}
        maxLength={500}
        multiline
      />
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{translate(strings, "include_diagnostics")}</Text>
        <Switch value={includeDiagnostics} onValueChange={setIncludeDiagnostics} />
      </View>
      <PrimaryButton label={translate(strings, "send")} onPress={handleSend} disabled={sending} />
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
  optionRow: {
    marginBottom: 12
  },
  optionButton: {
    backgroundColor: "#2d3748"
  },
  optionSelected: {
    backgroundColor: "#38a169"
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    minHeight: 100,
    marginBottom: 12
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  toggleLabel: {
    fontSize: 18
  }
});
