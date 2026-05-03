# Using prompt-to-json from Pi

This repository includes a project-local Pi extension that starts the local `prompt-to-json` MCP stdio server and exposes its MCP tools as Pi tools.

Pi does not include MCP hosting by default. This extension is a small bridge for this one local MCP server.

## Files

```text
.pi/extensions/prompt-to-json-mcp.ts
.pi/prompts/ptj-test.md
```

## Setup on Windows PowerShell

From this repository:

```powershell
cd C:\Users\harry\code\prompt-to-json
npm install
npm run build
pi
```

Pi auto-discovers the project extension from `.pi/extensions/`.

If you want to load only this extension explicitly for a one-off run:

```powershell
pi -e .\.pi\extensions\prompt-to-json-mcp.ts
```

## Exposed Pi tools

The extension registers these Pi tools:

| Pi tool | MCP tool |
| --- | --- |
| `ptj_list_contracts` | `list_contracts` |
| `ptj_read_contract` | `read_contract` |
| `ptj_get_json_contract` | `get_json_contract` |
| `ptj_validate_json` | `validate_json` |
| `ptj_get_repair_contract` | `get_repair_contract` |
| `ptj_reload_contracts` | `reload_contracts` |

The `ptj_` prefix avoids collisions with Pi's built-in tools and makes the workflow obvious.

## Slash commands

### `/ptj-status`

Starts the MCP server if needed, lists loaded contracts, and shows the contracts directory.

```text
/ptj-status
```

### `/ptj-reload`

Reloads contract files from disk.

```text
/ptj-reload
```

Use this after editing or adding files in `json-contracts/`.

## Manual test prompts

### 1. List contracts

```text
Use ptj_list_contracts and show me the available prompt-to-json contracts.
```

Expected: Pi calls `ptj_list_contracts` and reports contracts such as `support-ticket`, `ecommerce-return`, `patient-intake`, etc.

### 2. Support ticket happy path

```text
Use prompt-to-json with the support-ticket contract.

Input:
Urgent, users cannot log in after SSO update.

Get the contract, produce JSON, validate it, repair if needed, and show the final valid JSON.
```

Expected final JSON should look like:

```json
{
  "summary": "Users cannot log in after SSO update",
  "severity": "critical",
  "category": "authentication"
}
```

### 3. Repair flow

```text
Use ptj_validate_json against support-ticket with this invalid JSON:

{
  "summary": "Users cannot log in",
  "severity": "urgent"
}

Then use the repair contract and fix it. Validate the repaired JSON before answering.
```

Expected: Pi calls `ptj_validate_json`, sees enum and missing-field errors, calls `ptj_get_repair_contract`, repairs the JSON, and validates again.

### 4. Ecommerce example

```text
Use prompt-to-json with ecommerce-return.

Input:
Order A10492 arrived with a cracked ceramic mug. I opened the box but never used it. Can you send a replacement?

Generate valid JSON and validate it.
```

Expected: a valid ecommerce return/warranty object with `requestedResolution` set to `replacement`.

### 5. Contract reload

Add or edit a file in `json-contracts/`, then run:

```text
/ptj-reload
```

or ask Pi:

```text
Call ptj_reload_contracts, then list contracts again.
```

## Prompt template

A reusable prompt template is included:

```text
/ptj-test
```

It asks for:

```text
Contract: {{contract}}
Input: {{input}}
```

Example values:

```text
contract = real-estate-lead
input = We're pre-approved and want to buy a 3 bed condo in Austin under 650k within the next two months. Need parking and a small office. Text is best.
```

## Non-interactive smoke tests

These require whatever model/provider you already use with Pi.

```powershell
pi -p "Use ptj_list_contracts to list available prompt-to-json contracts."
```

Explicit extension path:

```powershell
pi -e .\.pi\extensions\prompt-to-json-mcp.ts -p "Use ptj_list_contracts to list available prompt-to-json contracts."
```

Only allow prompt-to-json tools:

```powershell
pi -e .\.pi\extensions\prompt-to-json-mcp.ts --tools ptj_list_contracts,ptj_read_contract,ptj_get_json_contract,ptj_validate_json,ptj_get_repair_contract,ptj_reload_contracts -p "Use prompt-to-json with support-ticket. Input: Urgent, users cannot log in after SSO update. Generate and validate final JSON."
```

## Correct mental model

Pi chooses and runs the model.

`prompt-to-json` supplies contracts and validation.

The model should follow this standard loop:

```text
ptj_get_json_contract
  -> model generates JSON
ptj_validate_json
  -> if invalid: ptj_get_repair_contract
  -> model repairs JSON
ptj_validate_json
```

This is the point of the integration: every app should not invent a custom prompt/schema/repair loop just to get reliable JSON out of AI.

## Troubleshooting

### Extension says the server is not built

Run:

```powershell
npm run build
```

Then restart Pi or run:

```text
/reload
```

### Contracts are missing

Check that Pi was started from this repository or a child folder:

```powershell
pwd
```

Then run:

```text
/ptj-status
```

If you want a custom contracts directory:

```powershell
$env:PROMPT_TO_JSON_CONTRACTS_DIR="C:\path\to\json-contracts"; pi
```

### Tool names do not appear

Run:

```text
/reload
```

If the extension still does not load, start Pi explicitly:

```powershell
pi -e .\.pi\extensions\prompt-to-json-mcp.ts
```
