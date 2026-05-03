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
- `name` is optional, but the filename is the source of truth.
- A `version` field is rejected; use Git for versioning.
- Contract files are plain JSON.

## Included example contracts

The default `json-contracts/` folder includes examples from different app categories where teams commonly rebuild the same AI glue code:

| Contract | Industry/app pattern | Converts natural language into |
| --- | --- | --- |
| `support-ticket` | SaaS support | Triage-ready support tickets. |
| `search-query` | Knowledge/search apps | Structured search queries. |
| `create-filter` | Internal tools/API builders | API filter objects. |
| `patient-intake` | Healthcare intake | Triage and appointment-routing objects. |
| `ecommerce-return` | Ecommerce support | Return, refund, exchange, and warranty requests. |
| `real-estate-lead` | Real estate CRM | Buyer, renter, seller, and lease lead profiles. |
| `legal-client-intake` | Legal tech intake | Matter routing and conflict-check data. |
| `expense-report` | Finance/expense apps | Reimbursement and expense line items. |

Each one uses the same MCP tools: read the contract, let the model produce JSON, validate it, and repair if needed. New apps should not need a new bespoke prompt framework just to get reliable JSON.

## MCP resources

Every loaded contract is exposed dynamically as:

```text
json-contract://{contractName}
```

Examples:

```text
json-contract://support-ticket
json-contract://search-query
json-contract://create-filter
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

Returns the selected contract's description, rules, schema, and examples.

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
  "schema": {},
  "examples": [],
  "input": "Urgent, users cannot log in after SSO update.",
  "context": {}
}
```

The agent/model uses this contract to produce JSON. The MCP server does not produce it.

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
  "contracts": ["support-ticket", "search-query", "create-filter"]
}
```

## Optional MCP prompts

The server also exposes reusable prompt helpers for MCP hosts that support prompts:

- `json_contract_prompt`
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

The Studio opens in **LLM API key mode** by default. You can switch to **Manual mode** if you want to copy/paste payloads into a separate model.

### LLM API key mode

For a 30-60 second live test:

1. Pick a contract.
2. Choose a provider.
3. Paste an API key, or use a key from `.env`.
4. Type any model name.
5. Choose a thinking level: `off`, `low`, `medium`, `high`, `xhigh`, or `auto`.
6. Leave **Advanced provider settings** blank unless you are using a custom endpoint.
7. Optionally tick **Save config** and **Save as default provider/model** to write the selected provider settings to your local `.env`.
8. Click **Generate JSON**.

### Manual mode

No provider key required.

1. Pick a contract.
2. Paste natural-language input.
3. Click **Get JSON contract**.
4. Copy that payload into any model or agent.
5. Paste the model JSON back into Studio.
6. Click **Validate JSON**.
7. If invalid, click **Get repair contract**, give that to the model, and validate again.

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

Keys pasted into the browser are sent only to the local Studio server for the current request. They are saved only when you tick **Save config**, which writes to the local project `.env`. API keys are written to provider-specific variables such as `OPENAI_API_KEY`; the custom OpenAI-compatible provider uses `LLM_API_KEY`.

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
