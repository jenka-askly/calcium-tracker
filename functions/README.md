<!--
Purpose: Document local development and diagnostics usage for the Azure Functions backend.
Persists: No persistence.
Security Risks: Describes configuration of secret-bearing environment variables; avoid committing secrets.
-->
# Azure Functions Backend

## Environment configuration

- Set local environment variables in `local.settings.json` under the `Values` section.
- Required settings vary based on feature flags (see `/api/diagnostics/env`).
- **Do not commit** secrets or local settings files containing keys.

## Diagnostics endpoint

- `GET /api/diagnostics/env`
  - Returns presence status for required and optional environment variables.
  - If you supply `x-admin-key` matching `ADMIN_KEY`, the response includes a sanitized snapshot.

