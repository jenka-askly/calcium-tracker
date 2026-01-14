// Purpose: Define the stack navigation structure for the app screens.
// Persists: No persistence.
// Security Risks: None.
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HomeScreen } from "../screens/HomeScreen";
import { PhotoCaptureScreen } from "../screens/PhotoCaptureScreen";
import { PhotoReviewScreen } from "../screens/PhotoReviewScreen";
import { QuestionsScreen } from "../screens/QuestionsScreen";
import { ResultScreen } from "../screens/ResultScreen";
import { TodayScreen } from "../screens/TodayScreen";
import { ReportScreen } from "../screens/ReportScreen";
import { SuggestionScreen } from "../screens/SuggestionScreen";

export type RootStackParamList = {
  Home: undefined;
  PhotoCapture: undefined;
  PhotoReview: undefined;
  Questions: undefined;
  Result: undefined;
  Today: undefined;
  Report: undefined;
  Suggestion: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerTitleStyle: { fontSize: 22 },
        headerBackTitleVisible: false
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="PhotoCapture" component={PhotoCaptureScreen} />
      <Stack.Screen name="PhotoReview" component={PhotoReviewScreen} />
      <Stack.Screen name="Questions" component={QuestionsScreen} />
      <Stack.Screen name="Result" component={ResultScreen} />
      <Stack.Screen name="Today" component={TodayScreen} />
      <Stack.Screen name="Report" component={ReportScreen} />
      <Stack.Screen name="Suggestion" component={SuggestionScreen} />
    </Stack.Navigator>
  );
}
