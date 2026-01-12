Purpose: Define the MVP test plan for the Calcium Camera app, covering API contracts, localization, and offline behavior.
Persists: No persistence directly; references SQLite tables (meals, settings) and server storage for packs/suggestions.
Security Risks: Ensures tests avoid logging PII or secrets; verify redaction behavior.

# Test Plan — Calcium Camera MVP

## 1. Objectives
- Validate MVP user flows (capture → questions → estimate → save).
- Ensure API contracts and schema validation align with `/docs/API_CONTRACT.json`.
- Confirm localization pack behavior and fallback rules.
- Verify cost controls, rate limiting, and safe logging behavior.

## 2. Test Environments
- Local dev (mock OpenAI responses where possible)
- Staging Azure Functions with test storage
- Offline mode on device/emulator

## 3. Functional Tests
### 3.1 Capture → Estimate → Save
- Take photo, answer 3 questions, get estimate.
- Save meal; ensure meal appears in Today view.

### 3.2 Low Confidence Flow
- Force low-confidence response.
- Confirm follow-up question or retake suggestion is shown.

### 3.3 Report (30 days)
- Seed 30 days of meals locally.
- Confirm daily totals and per-day list.

### 3.4 Suggestions
- Send suggestion without diagnostics.
- Send suggestion with diagnostics.
- Verify response `{ "ok": true }` and no PII logged.

## 4. Localization Tests
- Switch locale between `en`, `zh-Hans`, `es` and verify UI strings update.
- Simulate pack download failure; ensure fallback to cached pack or English.
- Validate translated pack keys match English keys.

## 5. API Contract Tests
- Validate requests/response against JSON schemas:
  - `EstimateCalciumRequest/Response`
  - `LocalizationLatestResponse`
  - `LocalizationRegenerateRequest/Response`
  - `SuggestionRequest/Response`
  - `StatusResponse`
- Confirm error responses match schemas for 400/429/503.

## 6. Reliability and Cost Controls
- Validate schema enforcement with one retry on invalid model output.
- Validate circuit breaker returns 503 when budget caps reached.
- Validate per-device rate limit returns 429 with retry_after_seconds.
- Ensure idempotency on `x-request-id` prevents double billing.

## 7. Logging and PII Safety
- Confirm logs include request_id and hashed device_install_id.
- Confirm logs do **not** include:
  - image bytes
  - raw suggestion message
  - device IDs in plain text
  - SAS URLs or API keys

## 8. Offline Behavior
- With no network, allow saving a meal with pending status.
- Later retry estimation and update record.

## 9. Regression Checklist (per release)
- Run schema validations.
- Verify localization pack download and cache.
- Spot-check large-font layouts and hit targets.
