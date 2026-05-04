# prompt-to-json Studio example

A tiny local web UI for demonstrating the `prompt-to-json` MCP workflow.

It has two tabs:

1. **LLM API key mode** — paste a provider key in the UI, or load one from `.env`, then generate, validate, and repair JSON locally.
2. **Manual mode** — no API key. Copy the contract payload into any model or agent, then paste the model's JSON back into the UI.

Provider calls are demo-only Studio behavior. The production MCP stdio server still does not call LLMs and does not use API keys.

## Quickstart

From the repository root:

```bash
npm install
npm run studio
```

Open:

```text
http://127.0.0.1:5177
```

Then:

1. Pick a contract.
2. Choose **Create new JSON** or **Edit existing JSON**.
3. Use the default **LLM API key mode**, or switch to **Manual mode**.
4. Generate or paste JSON.
5. Validate.
6. Repair if needed.

Use a different port if needed:

```bash
STUDIO_PORT=8080 npm run studio
```

On Windows PowerShell:

```powershell
$env:STUDIO_PORT=8080; npm run studio
```

## Extra context JSON

Both Studio modes include an **Extra context JSON** field.

Use it for app/system variables such as:

```json
{
  "current_datetime": "2026-05-03T00:00:00Z",
  "email": "JohnnyAppleseed@gmail.com",
  "tenantId": "demo-real-estate-crm"
}
```

The Studio sends this as the `context` object in `get_json_contract` or `get_edit_contract`. `prompt-to-json` passes context through unchanged; it does not hard-code date logic or business logic.

Important behavior:

- Context helps the model interpret the input.
- The final JSON still must match the selected contract schema.
- Context fields are not automatically copied into output JSON.
- In LLM API key mode, context is sent to the selected provider, so do not include secrets unless the provider should receive them.

## LLM API key mode

The fastest live test is:

1. Open the Studio. It starts in **LLM API key mode**.
2. Choose a provider.
3. Paste an API key, or use a key from `.env`.
4. Type the model name you want to test.
5. Choose a thinking level.
6. Optionally tick **Save config** and **Save as default provider/model**.
7. Choose **Create new JSON** or **Edit existing JSON**. For edit, paste the existing JSON and describe the requested change.
8. Click **Generate JSON** or **Generate edited JSON**.

Keys pasted into the browser are sent only to the local Studio server for that request. They are saved only when you tick **Save config**, which writes to your local project `.env`. The server binds to `127.0.0.1` by default.

Supported provider presets:

| Provider | Adapter | Default base URL |
| --- | --- | --- |
| OpenAI | OpenAI-compatible chat completions | `https://api.openai.com/v1` |
| Anthropic | Native Anthropic Messages API | `https://api.anthropic.com/v1` |
| Ollama Cloud | Native Ollama chat API | `https://ollama.com/api` |
| Local Ollama | Native Ollama chat API | `http://127.0.0.1:11434/api` |
| OpenRouter | OpenAI-compatible chat completions | `https://openrouter.ai/api/v1` |
| Groq | OpenAI-compatible chat completions | `https://api.groq.com/openai/v1` |
| Together AI | OpenAI-compatible chat completions | `https://api.together.xyz/v1` |
| Fireworks AI | OpenAI-compatible chat completions | `https://api.fireworks.ai/inference/v1` |
| DeepSeek | OpenAI-compatible chat completions | `https://api.deepseek.com/v1` |
| Mistral | OpenAI-compatible chat completions | `https://api.mistral.ai/v1` |
| Custom OpenAI-compatible | OpenAI-compatible chat completions | user-entered |

### Advanced provider settings

For built-in providers, leave **Base URL override** blank. The Studio automatically uses the correct cloud API default for the selected provider.

Only enter a Base URL when:

- you select **Custom OpenAI-compatible**
- your provider/account uses a special endpoint
- you are testing a proxy or local gateway

Examples:

```text
https://api.openai.com/v1
https://openrouter.ai/api/v1
http://127.0.0.1:11434/api
```

Do not include `/chat/completions` for OpenAI-compatible providers; the Studio appends that path.

Model is a free-text field. Examples:

```text
gpt-4.1-mini
claude-sonnet-4-5
kimi-k2.5
llama-3.3-70b-versatile
openai/gpt-4.1-mini
deepseek-chat
```

Thinking levels:

```text
off, low, medium, high, xhigh, auto
```

Thinking is provider/model-dependent:

- Ollama receives `think` as `low`, `medium`, `high`, `xhigh`, `false`, or the field is omitted for `auto`.
- OpenAI-compatible providers receive `reasoning_effort` where supported. `xhigh` maps to the provider's highest compatible effort when needed.
- Anthropic receives extended-thinking budgets where supported: low, medium, high, or xhigh.
- Providers/models that do not support thinking may ignore it or reject it. The Studio retries OpenAI-compatible requests without unsupported JSON/ reasoning fields when possible.

### Saving config from the UI

By default, the Studio does not write provider settings or API keys anywhere. In **LLM API key mode**, you can opt in:

- Tick **Save config** to write the selected provider's model, thinking level, pasted API key, and base URL override to the local `.env` immediately. While checked, provider config field changes are saved again automatically.
- Tick **Save as default provider/model** to also set `LLM_PROVIDER` so the saved provider/model is selected on the next load.

API keys are written to provider-specific variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY`. The custom OpenAI-compatible provider uses `LLM_API_KEY`. This keeps saved keys tied to the provider you selected instead of storing them in browser storage.

## Create and edit operations

Contracts can define top-level `operations` metadata. If omitted, the server treats both `create` and `edit` as enabled by default. Edit mode sends `currentJson` separately from `context`, asks the model to preserve unspecified fields, and expects the complete updated JSON object back.

Example edit request:

```json
{
  "currentJson": {
    "status": "open",
    "limit": 50
  },
  "input": "we want the last 20 closed tickets"
}
```

Expected edited JSON:

```json
{
  "status": "closed",
  "limit": 20
}
```

## Optional `.env` setup

Instead of pasting a key into the UI each time, either tick **Save config** in the Studio or copy:

```bash
cp examples/studio/.env.example .env
```

Windows PowerShell:

```powershell
Copy-Item examples/studio/.env.example .env
```

Then fill in values:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
LLM_THINKING=medium
```

Ollama Cloud:

```env
LLM_PROVIDER=ollama-cloud
OLLAMA_API_KEY=your_key_here
OLLAMA_MODEL=kimi-k2.5
OLLAMA_THINKING=medium
```

Local Ollama:

```env
LLM_PROVIDER=ollama-local
OLLAMA_BASE_URL=http://127.0.0.1:11434/api
OLLAMA_MODEL=llama3.2
```

Anthropic:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-sonnet-4-5
LLM_THINKING=medium
```

OpenRouter:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openai/gpt-4.1-mini
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `STUDIO_PORT` | `5177` | Studio HTTP port. |
| `STUDIO_HOST` | `127.0.0.1` | Studio HTTP host. Keep local when entering keys. |
| `PROMPT_TO_JSON_CONTRACTS_DIR` | `./json-contracts` | Contract folder. |
| `LLM_PROVIDER` | `openai` | Default provider ID shown in the UI. |
| `LLM_MODEL` | provider default | Generic model fallback. Provider-specific model env vars override this. |
| `LLM_THINKING` | `medium` | `off`, `low`, `medium`, `high`, `xhigh`, or `auto`. |
| `LLM_API_KEY` | unset | Generic API key fallback for custom/OpenAI-compatible testing. |
| `LLM_BASE_URL` | provider default | Generic base URL fallback. |
| `LLM_REQUEST_TIMEOUT_MS` | `120000` | Provider request timeout. |
| `OPENAI_API_KEY` | unset | OpenAI key. |
| `ANTHROPIC_API_KEY` | unset | Anthropic key. |
| `OLLAMA_API_KEY` | unset | Ollama Cloud bearer token. |
| `OPENROUTER_API_KEY` | unset | OpenRouter key. |
| `GROQ_API_KEY` | unset | Groq key. |
| `TOGETHER_API_KEY` | unset | Together AI key. |
| `FIREWORKS_API_KEY` | unset | Fireworks AI key. |
| `DEEPSEEK_API_KEY` | unset | DeepSeek key. |
| `MISTRAL_API_KEY` | unset | Mistral key. |
| `OLLAMA_BASE_URL` | `https://ollama.com/api` or provider preset | Ollama API base URL. Use `http://127.0.0.1:11434/api` for local Ollama. |
| `OLLAMA_MODEL` | provider default | Ollama model. |
| `OLLAMA_THINKING` | `medium` | Backward-compatible Ollama thinking default. Supports `xhigh`. |
| `OLLAMA_FORMAT` | `schema` | `schema`, `json`, or `none`. `schema` sends the contract schema as Ollama's structured output format. |

## Try your own contracts

The Studio reads the same contract folder as the MCP server. Add a new `.json` contract file to `json-contracts/`, then click **Reload** in the UI.

Or point the Studio at another folder:

```bash
PROMPT_TO_JSON_CONTRACTS_DIR=/path/to/contracts npm run studio
```

On Windows PowerShell:

```powershell
$env:PROMPT_TO_JSON_CONTRACTS_DIR="C:\path\to\contracts"; npm run studio
```

## API used by the UI

The example server wraps the same tool handlers that the MCP stdio server exposes:

- `GET /api/contracts` → `list_contracts`
- `GET /api/contracts/:name` → `read_contract`
- `POST /api/json-contract` → `get_json_contract`
- `POST /api/edit-contract` → `get_edit_contract`
- `POST /api/validate` → `validate_json`
- `POST /api/repair-contract` → `get_repair_contract`
- `POST /api/reload` → `reload_contracts`

The Studio also exposes demo-only LLM routes:

- `GET /api/llm/providers` → provider presets and thinking levels, without secrets
- `GET /api/llm/config` → backward-compatible alias for `/api/llm/providers`
- `POST /api/llm/save-config` → write selected provider settings to the local `.env` when the user opts in
- `POST /api/llm/generate` → get a JSON contract, including optional `context`, call the selected provider, parse output, then validate
- `POST /api/llm/edit` → get an edit contract, including `currentJson` and optional `context`, call the selected provider, parse output, then validate
- `POST /api/llm/repair` → get a repair contract, call the selected provider, parse output, then validate

These HTTP endpoints are only for the demo Studio. The production MCP server remains the stdio server started by `prompt-to-json`.
