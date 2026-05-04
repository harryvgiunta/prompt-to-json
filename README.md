# prompt-to-json

prompt-to-json is a local MCP contract server. It gives agents Git-controlled JSON contracts and validation tools so any model can reliably convert natural language into schema-valid JSON.

The MCP server does not call an LLM provider.
The MCP server does not need API keys.
The MCP server does not use BAML, LangChain, Markdown, or a DSL.
The MCP server does not use MCP sampling.
The MCP server does not generate JSON by itself.

The optional Studio example can call LLM provider APIs for live demos, but that is separate from the MCP stdio server.

Your agent chooses the model.
Your agent performs the conversion.
`prompt-to-json` provides the contract.

## Correct mental model

Not this:

```text
prompt-to-json = generator
```

This:

```text
prompt-to-json = schema contract registry + validator
```

Like TypeScript:

```text
developer writes code
TypeScript validates it
```

With `prompt-to-json`:

```text
agent writes JSON
prompt-to-json validates it
```

## Architecture

```text
User
  ↓
Agent using whatever model the user picked
  ↓
prompt-to-json MCP server
  - lists available JSON contracts
  - returns schemas, rules, examples, and instructions
  - validates agent-produced JSON
  - returns repair contracts when validation fails
  ↓
Agent generates or repairs JSON itself
  ↓
App consumes valid JSON
```

The MCP server never performs natural-language-to-JSON conversion itself. It only provides contracts, validation, and repair guidance.

## Install

```bash
npm install -g prompt-to-json
```

Or run without installing:

```bash
npx prompt-to-json
```

By default, the server starts as a local stdio MCP server and loads contracts from:

```text
./json-contracts
```

## MCP config

```json
{
  "mcpServers": {
    "prompt-to-json": {
      "command": "npx",
      "args": ["prompt-to-json"],
      "env": {
        "PROMPT_TO_JSON_CONTRACTS_DIR": "./json-contracts"
      }
    }
  }
}
```

Adding a new behavior only requires adding a new `.json` file to the contracts folder. No MCP config change is required.

## Adopt in your agent/app

Use `prompt-to-json` as a local contract/validation tool beside the model your app already uses.

### 1. Add the MCP server

If your agent host supports MCP, add the server config above and point `PROMPT_TO_JSON_CONTRACTS_DIR` at the contracts folder your app owns.

If your app has its own agent runtime, connect to the same MCP stdio server and call the tools directly. The important part is the flow, not the host.

### 2. Write one contract per JSON behavior

Create files such as:

```text
json-contracts/support-ticket.json
json-contracts/real-estate-lead.json
json-contracts/chart-generation.json
```

Each file contains:

- `schema` for the final JSON shape
- `rules` for app-specific mapping behavior
- `examples` for model guidance
- optional `operations` for create/edit behavior

### 3. Pass app/system variables as `context`

Do not hide runtime variables in the user prompt. Pass them as `context`:

```json
{
  "contract": "real-estate-lead",
  "input": "I'm pre-approved for a 4 bedroom house in Durham NC up to 900k.",
  "context": {
    "current_datetime": "2026-05-03T00:00:00Z",
    "email": "JohnnyAppleseed@gmail.com",
    "source": "website-lead-form"
  }
}
```

`prompt-to-json` passes context through unchanged. Contracts decide how to use it through rules/examples. The final JSON still must match the schema.

### 4. Give your agent this tool policy

Use this as the system/developer instruction for your agent:

```text
When converting natural language into app JSON, use prompt-to-json.

Create flow:
1. Call get_json_contract with contract, input, and context.
2. Generate JSON using the returned schema, rules, examples, input, and context.
3. Call validate_json.
4. If invalid, call get_repair_contract, repair the JSON, and validate again.
5. Return only validated JSON to the app.

Edit flow:
1. Call get_edit_contract with contract, currentJson, input, and context.
2. Return the complete updated object, not a patch.
3. Call validate_json.
4. Repair and validate again if needed.

Never skip validation. Never add fields that are not allowed by the schema. Do not copy context fields into output unless the schema allows them and the contract rules say to use them.
```

### 5. Runtime loop in your app

At request time, your app should do:

```text
user input + app context
  -> get_json_contract or get_edit_contract
  -> your chosen model generates JSON
  -> validate_json
  -> if invalid: get_repair_contract -> model repairs -> validate_json
  -> app consumes valid JSON
```

The MCP server does not call the model and does not mutate output. Your app/agent remains in control of model choice, provider keys, context, and business defaults.

## Contract files

Each contract is one `.json` file in `json-contracts/`.

The contract name is derived from the filename:

```text
json-contracts/support-ticket.json -> support-ticket
```

There is no manifest file and no manually maintained resources file. Git handles versioning.

### Contract shape

```json
{
  "description": "Convert natural language into a support ticket object.",
  "rules": [
    "If the user says urgent, severity must be critical.",
    "Summary must be under 80 characters.",
    "Category must be authentication, billing, bug, feature_request, or other."
  ],
  "operations": {
    "create": {
      "enabled": true
    },
    "edit": {
      "enabled": true,
      "return": "full_object",
      "rules": [
        "Start from currentJson.",
        "Apply only the user's requested change.",
        "Preserve all unspecified fields exactly.",
        "Return the complete updated JSON object."
      ]
    }
  },
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "summary": {
        "type": "string",
        "maxLength": 80
      },
      "severity": {
        "type": "string",
        "enum": ["low", "medium", "high", "critical"]
      },
      "category": {
        "type": "string",
        "enum": ["authentication", "billing", "bug", "feature_request", "other"]
      }
    },
    "required": ["summary", "severity", "category"]
  },
  "examples": [
    {
      "input": "Urgent, users cannot log in after SSO update.",
      "output": {
        "summary": "Users cannot log in after SSO update",
        "severity": "critical",
        "category": "authentication"
      }
    }
  ]
}
```

Rules:

- `schema` is required.
- `description` is optional but recommended.
- `rules` is optional and defaults to `[]`.
- `examples` is optional and defaults to `[]`.
- `operations` is optional and defaults to enabled `create` and `edit` operations. Operation metadata belongs at the top level, not inside the JSON Schema.
- `name` is optional, but the filename is the source of truth.
- A `version` field is rejected; use Git for versioning.
- Contract files are plain JSON.

## Included example contracts

The default `json-contracts/` folder includes examples from different app categories where teams commonly rebuild the same AI glue code:

| Contract | Industry/app pattern | Converts natural language into |
| --- | --- | --- |
| `support-ticket` | SaaS support | Triage-ready support tickets. |
| `create-filter` | Internal tools/API builders | API filter objects. |
| `chart-generation` | BI/analytics tools | Dashboard chart generation specs. |
| `patient-intake` | Healthcare intake | Triage and appointment-routing objects. |
| `ecommerce-return` | Ecommerce support | Return, refund, exchange, and warranty requests. |
| `real-estate-lead` | Real estate CRM | Buyer, renter, seller, and lease lead profiles. |
| `legal-client-intake` | Legal tech intake | Matter routing and conflict-check data. |
| `expense-report` | Finance/expense apps | Reimbursement and expense line items. |

Each one uses the same MCP tools: read the contract, let the model create or edit JSON, validate it, and repair if needed. New apps should not need a new bespoke prompt framework just to get reliable JSON.

## MCP resources

Every loaded contract is exposed dynamically as:

```text
json-contract://{contractName}
```

Examples:

```text
json-contract://support-ticket
json-contract://create-filter
json-contract://chart-generation
```

`resources/list` returns all loaded contracts. `resources/read` returns the normalized full contract JSON.

## Stable MCP tools

### `list_contracts`

Input:

```json
{}
```

Output:

```json
{
  "contracts": [
    {
      "name": "support-ticket",
      "description": "Convert natural language into a support ticket object."
    }
  ]
}
```

### `read_contract`

Input:

```json
{
  "contract": "support-ticket"
}
```

Returns the selected contract's description, rules, operations, schema, and examples.

### `get_json_contract`

Input:

```json
{
  "contract": "support-ticket",
  "input": "Urgent, users cannot log in after SSO update.",
  "context": {}
}
```

Output:

```json
{
  "contract": "support-ticket",
  "operation": "create",
  "instructions": [
    "Convert the input into JSON.",
    "Return JSON only.",
    "Do not return markdown.",
    "Do not include commentary.",
    "Do not include extra keys.",
    "Match the schema exactly.",
    "Use enum values exactly.",
    "Follow all rules.",
    "Use examples as guidance."
  ],
  "description": "Convert natural language into a support ticket object.",
  "rules": [
    "If the user says urgent, severity must be critical.",
    "Summary must be under 80 characters.",
    "Category must be authentication, billing, bug, feature_request, or other."
  ],
  "operationRules": [],
  "schema": {},
  "examples": [],
  "operationExamples": [],
  "input": "Urgent, users cannot log in after SSO update.",
  "context": {}
}
```

The agent/model uses this contract to produce JSON. The MCP server does not produce it.

### `get_edit_contract`

Input:

```json
{
  "contract": "create-filter",
  "currentJson": {
    "status": "open",
    "limit": 50
  },
  "input": "we want the last 20 closed tickets",
  "context": {}
}
```

Output:

```json
{
  "contract": "create-filter",
  "operation": "edit",
  "instructions": [
    "Start from currentJson.",
    "Apply only the user's requested change.",
    "Preserve all unspecified fields exactly.",
    "Return the complete updated JSON object, not a patch.",
    "Return JSON only."
  ],
  "description": "Convert natural language into a structured API filter object.",
  "rules": [
    "Only include fields that are explicitly requested or clearly implied."
  ],
  "operationRules": [
    "Preserve all unspecified fields exactly."
  ],
  "schema": {},
  "examples": [],
  "operationExamples": [],
  "currentJson": {
    "status": "open",
    "limit": 50
  },
  "input": "we want the last 20 closed tickets",
  "context": {}
}
```

The agent/model uses this edit contract to return the complete updated JSON object. The MCP server first validates `currentJson` against the selected contract, and the agent should validate the edited object with `validate_json` afterward.

#### Context and system variables

`context` is an intentional pass-through object for app/system variables that should help the model interpret the user's input.

Examples:

```json
{
  "contract": "real-estate-lead",
  "input": "I'm pre-approved for a 4 bedroom house in Durham NC up to 900k. We need a pool and a large backyard for dogs. We are looking to move this summer.",
  "context": {
    "current_datetime": "2026-05-03T00:00:00Z",
    "email": "JohnnyAppleseed@gmail.com"
  }
}
```

`prompt-to-json` does not interpret, normalize, or validate `context` against a separate schema. It returns the object unchanged in the contract payload so the model can use it with the contract rules and output schema.

Important behavior:

- Put external variables in `context`, not by appending hidden text to `input`.
- The final JSON must still match the contract schema.
- Context fields should not appear in the final JSON unless the contract schema allows them.
- Contracts can define how to use context through `rules`, examples, and schema shape.
- Relative values such as "this summer" or "last week" should be resolved by the model using whatever date/time/location context the app provides.

### `validate_json`

Input:

```json
{
  "contract": "support-ticket",
  "json": {
    "summary": "Users cannot log in after SSO update",
    "severity": "critical",
    "category": "authentication"
  }
}
```

Success:

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

Failure:

```json
{
  "valid": false,
  "contract": "support-ticket",
  "errors": [
    {
      "path": "/severity",
      "message": "must be equal to one of the allowed values",
      "keyword": "enum"
    }
  ]
}
```

`valid` is never `true` unless Ajv validates the JSON against the contract schema.

### `get_repair_contract`

Input:

```json
{
  "contract": "support-ticket",
  "invalidJson": {
    "summary": "Users cannot log in",
    "severity": "urgent"
  },
  "validationErrors": []
}
```

Output:

```json
{
  "contract": "support-ticket",
  "instructions": [
    "Repair the JSON so it validates against the schema.",
    "Return JSON only.",
    "Do not return markdown.",
    "Do not include commentary.",
    "Do not include extra keys.",
    "Preserve valid fields where possible."
  ],
  "schema": {},
  "rules": [],
  "examples": [],
  "invalidJson": {},
  "validationErrors": []
}
```

The agent/model uses this repair contract to produce corrected JSON. The MCP server does not repair by calling a model.

### `reload_contracts`

Input:

```json
{}
```

Output:

```json
{
  "loaded": 3,
  "contracts": ["support-ticket", "create-filter", "chart-generation"]
}
```

## Optional MCP prompts

The server also exposes reusable prompt helpers for MCP hosts that support prompts:

- `json_contract_prompt`
- `edit_contract_prompt`
- `repair_contract_prompt`

These prompts only render contract text for the agent/model. They do not call a model and they do not generate JSON inside the MCP server.

## Correct flow

User:

```text
Create a support ticket: urgent, users cannot log in after SSO update.
```

Agent calls:

```json
{
  "tool": "get_json_contract",
  "arguments": {
    "contract": "support-ticket",
    "input": "Urgent, users cannot log in after SSO update."
  }
}
```

MCP returns schema, rules, examples, instructions, and input.

Agent/model produces:

```json
{
  "summary": "Users cannot log in after SSO update",
  "severity": "critical",
  "category": "authentication"
}
```

Agent calls:

```json
{
  "tool": "validate_json",
  "arguments": {
    "contract": "support-ticket",
    "json": {
      "summary": "Users cannot log in after SSO update",
      "severity": "critical",
      "category": "authentication"
    }
  }
}
```

MCP returns:

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

If invalid, the agent calls `get_repair_contract`, uses its own model to repair, and calls `validate_json` again.

### Edit flow

For existing JSON, the agent calls `get_edit_contract` with the current JSON plus a natural-language change request:

```json
{
  "tool": "get_edit_contract",
  "arguments": {
    "contract": "create-filter",
    "currentJson": {
      "status": "open",
      "limit": 50
    },
    "input": "we want the last 20 closed tickets"
  }
}
```

The model returns the complete edited object:

```json
{
  "status": "closed",
  "limit": 20
}
```

Then the agent validates that final edited object with `validate_json`.

## Studio quickstart

Think of this like a local Next.js-style quickstart for testing schemas and JSON repair loops.

```bash
# after cloning or downloading this repo
cd prompt-to-json
npm install
npm run studio
```

Open:

```text
http://127.0.0.1:5177
```

The Studio opens in **LLM API key mode** by default. Use the operation selector to choose **Create new JSON** or **Edit existing JSON**. You can switch to **Manual mode** if you want to copy/paste payloads into a separate model.

### LLM API key mode

For a 30-60 second live test:

1. Pick a contract.
2. Choose a provider.
3. Paste an API key, or use a key from `.env`.
4. Type any model name.
5. Choose a thinking level: `off`, `low`, `medium`, `high`, `xhigh`, or `auto`.
6. Leave **Advanced provider settings** blank unless you are using a custom endpoint.
7. Optionally tick **Save config** and **Save as default provider/model** to write the selected provider settings to your local `.env` immediately.
8. Choose **Create new JSON** or **Edit existing JSON**. For edit, paste the existing JSON and describe the requested change.
9. Click **Generate JSON** or **Generate edited JSON**.

### Manual mode

No provider key required.

1. Pick a contract.
2. Choose **Create new JSON** or **Edit existing JSON**.
3. Paste natural-language input. For edit, also paste the existing JSON.
4. Click **Get JSON contract** or **Get edit contract**.
5. Copy that payload into any model or agent.
6. Paste the model JSON back into Studio.
7. Click **Validate JSON**.
8. If invalid, click **Get repair contract**, give that to the model, and validate again.

The Studio supports:

- OpenAI
- Anthropic
- Ollama Cloud
- Local Ollama
- OpenRouter
- Groq
- Together AI
- Fireworks AI
- DeepSeek
- Mistral
- Custom OpenAI-compatible endpoints

Keys pasted into the browser are sent only to the local Studio server. They are saved only when you tick **Save config**, which writes to the local project `.env` immediately. API keys are written to provider-specific variables such as `OPENAI_API_KEY`; the custom OpenAI-compatible provider uses `LLM_API_KEY`.

If you prefer to create `.env` manually, copy `examples/studio/.env.example` to `.env` and fill in values such as:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
LLM_THINKING=medium
```

Ollama still works:

```env
LLM_PROVIDER=ollama-cloud
OLLAMA_API_KEY=your_key_here
OLLAMA_MODEL=kimi-k2.5
OLLAMA_THINKING=medium
```

Local Ollama does not require a key:

```env
LLM_PROVIDER=ollama-local
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
OLLAMA_MODEL=llama3.2
```

To test your own contracts, add `.json` files to `json-contracts/` and click **Reload**, or run with `PROMPT_TO_JSON_CONTRACTS_DIR=/path/to/contracts`.

See [`examples/studio`](examples/studio) for details.

## Pi local integration

This repo also includes a project-local Pi extension at `.pi/extensions/prompt-to-json-mcp.ts`. It starts the local MCP stdio server and exposes the server tools to Pi as `ptj_*` tools for manual testing.

From this repo on Windows PowerShell:

```powershell
npm run build
pi
```

Then try:

```text
/ptj-status
```

See [`docs/pi-integration.md`](docs/pi-integration.md) for the full setup and test prompts.

## Git-controlled behavior

The `json-contracts/` folder is the product surface.

- Add behavior by adding a new `.json` file.
- Edit behavior by editing an existing `.json` file.
- Review behavior through Git pull requests.
- Roll back behavior through Git.

No provider keys, SDKs, sampling, or MCP config changes are required when contracts change.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PROMPT_TO_JSON_CONTRACTS_DIR` | `./json-contracts` | Folder containing contract `.json` files. |
| `MCP_TRANSPORT` | `stdio` | Transport. v1 implements stdio. |
| `PORT` | `3000` | Reserved for future HTTP transport. |
| `API_AUTH_TOKEN` | unset | Reserved for future HTTP Bearer auth. |
| `DEBUG` | `false` | Enables debug logging to stderr. |
| `WATCH_CONTRACTS` | `true` | Watches local contracts and reloads on changes. |
| `ALLOW_INVALID_CONTRACTS` | `false` | If true, invalid contracts are skipped with warnings. |

Studio-only LLM provider variables are documented in [`examples/studio`](examples/studio). The MCP stdio server does not use them.

In stdio mode, logs are written to stderr only. The server never writes logs to stdout.

## Security notes

The MCP server in `prompt-to-json`:

- never calls an LLM provider
- never uses provider API keys
- never performs MCP sampling
- never executes anything from contract files
- never uses `eval`
- never imports code from `json-contracts`
- never logs full user input unless `DEBUG=true`
- validates MCP tool inputs with Zod
- enforces contract file, schema, and examples limits
- rejects unsafe contract names and resource URIs
- prevents path traversal

The optional Studio example can call LLM providers only when you configure a key in the local UI or `.env` file; those provider calls are not part of the MCP stdio server.

## Licensing and trademarks

Project owner: **Harry Giunta**.

Licensing model:

- Runtime code, docs, examples, tests, and project infrastructure are licensed under **Apache-2.0**. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
- Official starter contracts in [`json-contracts/`](json-contracts/) are licensed under **Apache-2.0 OR MIT**, at your option. See [`json-contracts/LICENSE.md`](json-contracts/LICENSE.md).
- Third-party or marketplace contract packs may use creator-selected licenses. They should include their own license file or license metadata and must not imply official status unless approved.

The project name **prompt-to-json** is subject to the trademark policy in [`TRADEMARKS.md`](TRADEMARKS.md). Copyright licenses do not grant trademark rights.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution licensing and project guidelines.

## Development

```bash
npm install
npm test
npm run build
npm run dev
npm run studio
```

Run locally as an MCP stdio server:

```bash
npx prompt-to-json
```

Or from this repository:

```bash
npm run dev
```

## Docker

Docker support is optional. A sample Dockerfile is included for packaging the stdio server with its default contracts.
