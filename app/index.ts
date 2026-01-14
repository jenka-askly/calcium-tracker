// Purpose: Register the Expo root component and ensure runtime bootstrapping is applied.
// Persists: None.
// Security Risks: None.
import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
