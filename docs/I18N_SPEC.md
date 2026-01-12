Purpose: Define localization pack generation, versioning, caching, and validation for the Calcium Camera MVP.
Persists: Server localization packs stored at locales/{ui_version}/{locale}.json and locales/latest.json; client cached packs in local storage.
Security Risks: Pack URLs may be signed; avoid logging full URLs or any SAS tokens in client or server logs.

# I18N Specification

## Supported Locales (MVP)
- `en` (embedded base pack in app)
- `zh-Hans` (Simplified Chinese)
- `es` (Spanish)

## Key Principles
- English is the source of truth for all keys.
- Translations must preserve keys exactly (1:1).
- Short, elder-friendly strings; avoid medical claims.
- App must function if localization fetch fails (fallback to English).

## UI Versioning
- Compute `ui_version` as SHA-256 hash of canonical `en.json` content (stable formatting).
- Server stores packs at `locales/{ui_version}/{locale}.json`.
- Server stores a pointer at `locales/latest.json`:
  ```json
  { "ui_version": "<sha256>", "supported_locales": ["en", "zh-Hans", "es"] }
  ```

## Client Fetch + Cache Behavior
1. On startup, load cached pack (if present) for selected locale.
2. Call `GET /api/localization/latest?locale=<locale>`.
3. If server `ui_version` differs from cached, download `pack_url` and cache locally.
4. If download fails:
   - Keep cached pack if available.
   - Otherwise fall back to embedded English.

## Server Pack Generation
- Trigger via `POST /api/localization/regenerate` (admin-only).
- Input:
  - `ui_version`
  - `base_en_json` (key/value strings)
  - `locales` to generate
- Output:
  - `ui_version`, `generated`, `warnings`

## Validation Rules (Server)
- **Key match**: translated keys must exactly match `en.json` keys.
- **No extras**: no extra keys allowed.
- **Length constraints**: configurable max length for button labels.
- **Back-translation (optional)**: log warnings only, non-blocking for MVP.

## Localization QA Checklist
- English base pack updated with any new keys before translation generation.
- Keys validated before publishing packs.
- `locales/latest.json` updated to point to current `ui_version`.
- Sample UI review for text overflow on elder-sized buttons.

## Error Handling
- If `GET /localization/latest` fails or returns unsupported locale, app falls back to English.
- If translation pack schema is invalid, discard and keep existing cache.

## Logging Guidance
- Log locale, ui_version, and success/failure status.
- Do **not** log pack URLs if they contain signed tokens.
