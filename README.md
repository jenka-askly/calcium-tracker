# Purpose: Document how to run the Calcium Camera MVP app and Azure Functions locally.
# Persists: No persistence.
# Security Risks: None.

# Calcium Camera MVP

## Run the app (Expo)
- `cd app`
- `npm install`
- `npm run start`

## Run the functions (Azure Functions)
- `cd functions`
- `npm install`
- `npm run build`
- `npm run start`

### Local settings example (functions/local.settings.json)
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "OPENAI_API_KEY": "sk-...",
    "OPENAI_MODEL": "gpt-4o-mini",
    "USE_MOCK_ESTIMATE": "false"
  }
}
```
