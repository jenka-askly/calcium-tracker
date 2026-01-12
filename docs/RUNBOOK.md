Purpose: Provide operational guidance for the Calcium Camera Azure Functions backend (budget caps, rate limits, logging, and incident response).
Persists: References storage of localization packs and suggestion records in Azure Blob or Table Storage.
Security Risks: Covers key rotation, signed URLs, and handling of hashed device identifiers; avoid logging secrets.

# Runbook — Calcium Camera MVP

## Service Overview
- Azure Functions backend that powers:
  - Calcium estimation (`POST /api/estimateCalcium`)
  - Localization pack retrieval/regeneration (`GET /api/localization/latest`, `POST /api/localization/regenerate`)
  - Suggestions (`POST /api/suggestion`)
  - Status (`GET /api/status`)

## Critical Dependencies
- OpenAI API (vision + translation models)
- Azure Blob Storage (localization packs, suggestion records)
- Azure Cache for Redis (preferred) or Table Storage for counters/limits

## Configuration (Environment Variables)
**Core**
- `OPENAI_MODEL_ESTIMATE`
- `OPENAI_MODEL_TRANSLATE`

**Budget / Circuit Breaker**
- `DAILY_USD_CAP`
- `HOURLY_USD_CAP`
- `ESTIMATE_MAX_USD_PER_CALL`

**Rate Limiting**
- `MAX_CALLS_PER_DAY`
- `MAX_CALLS_PER_MINUTE`

**Storage**
- Connection setting for Blob or Table Storage (name depends on deployment)

## Health and Status
- `GET /api/status` returns:
  - `estimation_enabled`
  - `lockout_active`
  - `message`

Use this endpoint for basic health checks and for client UI messaging.

## Circuit Breaker (Cost Control)
- **Reservation step**: reserve `ESTIMATE_MAX_USD_PER_CALL` before OpenAI call.
- **If insufficient**: set lockout and return 503.
- **Reconcile** after call using actual token costs.
- **Lockout** if post-reconcile exceeds caps.

## Rate Limiting / Abuse Prevention
- Identify callers by `x-device-install-id` (hash before storage/logs).
- Per-device limits: `MAX_CALLS_PER_DAY`, `MAX_CALLS_PER_MINUTE`.
- Quarantine abnormal devices for 24h.

## Localization Pack Operations
### Generate Packs
- Call `POST /api/localization/regenerate` with `ui_version`, base `en.json`, and target locales.
- Validate packs for key match and length constraints.
- Publish to `locales/{ui_version}/{locale}.json` and update `locales/latest.json`.

### Rollback
- If a translation pack is faulty, point `locales/latest.json` back to the previous `ui_version`.

## Logging
- Structured logs with: request_id, hashed device_install_id, model name, timings, token usage, status.
- Never log images, raw suggestion text, SAS tokens, or API keys.

## Incident Playbooks
### 503 Temporarily Disabled (Circuit Breaker Triggered)
1. Check budget caps and recent spend (daily/hourly).
2. Verify reservation/reconcile logic in counters.
3. If spend is valid, wait for cap reset or raise budget.

### 429 Rate Limited
1. Confirm per-device counters.
2. Check for abuse or looping client behavior.
3. Adjust `MAX_CALLS_PER_MINUTE` or block offender if necessary.

### OpenAI Errors / Schema Violations
1. Verify JSON schema validation logs.
2. Ensure retry-once logic is active.
3. If invalid responses persist, disable estimation or pin to a stable model.

## Security and Key Rotation
- Rotate OpenAI keys and storage keys using standard Azure procedures.
- Do not log keys, SAS URLs, or authorization headers.
- Ensure suggestion records are stored in access-limited containers.

## Data Retention
- Localization packs: keep versioned history for rollback.
- Suggestions: retain only scrubbed messages and diagnostics.

## Rebuild / Redeploy Checklist
**Client (React Native / Expo)**
- Clean and rebuild the app.
- If local schema changes: clear local app data and re-open.

**Azure Functions**
- Rebuild and redeploy the Function App.
- Update app settings if any new keys/flags were added.

**Storage (Blob/Table)**
- If data contracts changed, clear or migrate:
  - `locales/{ui_version}/{locale}.json`
  - `locales/latest.json`
  - suggestion storage container/table
