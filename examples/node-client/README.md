# Minimal Node MCP client example

This example shows the application-side loop without bundling an LLM provider into `prompt-to-json`.

The MCP server supplies the contract and validates JSON. Your app/model supplies the candidate JSON.

## Run from this repository

```bash
npm install
npm run build

MODEL_JSON='{"summary":"Users cannot log in after SSO update","severity":"critical","category":"authentication"}' \
  node examples/node-client/client.mjs support-ticket "Urgent, users cannot log in after SSO update."
```

Expected output:

```json
{
  "valid": true,
  "contract": "support-ticket",
  "json": {
    "summary": "Users cannot log in after SSO update",
    "severity": "critical",
    "category": "authentication"
  },
  "errors": []
}
```

## Repair loop

If `MODEL_JSON` is invalid, the example calls `get_repair_contract`. Set `REPAIRED_MODEL_JSON` to what your model returns after seeing that repair payload:

```bash
MODEL_JSON='{"severity":"urgent"}' \
REPAIRED_MODEL_JSON='{"summary":"Users cannot log in after SSO update","severity":"critical","category":"authentication"}' \
  node examples/node-client/client.mjs support-ticket "Urgent, users cannot log in after SSO update."
```

## Context

Pass app/system context as JSON:

```bash
APP_CONTEXT='{"source":"website","current_datetime":"2026-05-04T00:00:00Z"}' \
MODEL_JSON='{"summary":"Users cannot log in after SSO update","severity":"critical","category":"authentication"}' \
  node examples/node-client/client.mjs support-ticket "Urgent, users cannot log in after SSO update."
```

The example intentionally does not call an LLM provider. In a real app, replace `getModelJson()` with your own provider call.
