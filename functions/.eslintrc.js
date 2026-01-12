// Purpose: Define linting rules for Azure Functions TypeScript code.
// Persists: No persistence.
// Security Risks: None.
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    es2020: true
  },
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
