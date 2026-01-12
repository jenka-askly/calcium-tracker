// Purpose: Configure Babel for the Expo app.
// Persists: No persistence.
// Security Risks: None.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"]
  };
};
