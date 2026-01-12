// Purpose: Define linting rules for the Expo app.
// Persists: No persistence.
// Security Risks: None.
module.exports = {
  root: true,
  extends: ["expo"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "TryStatement",
        message: "Avoid try/catch around imports."
      }
    ]
  }
};
