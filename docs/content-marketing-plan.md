---
title: YouTube Content Marketing Plan
description: Search-driven short-form content strategy for prompt-to-json and reliable LLM structured output.
---

# YouTube Content Marketing Plan

This document turns the core `prompt-to-json` positioning into a repeatable short-form video strategy for YouTube Shorts, TikTok, LinkedIn, and X.

The main content thesis:

> Most developers think structured output is a prompting problem. It is actually a contract and validation problem.

Use the product as the solution, but do not position it as an LLM generator. `prompt-to-json` is a local MCP contract registry and validator. The model generates or repairs JSON. `prompt-to-json` provides schemas, rules, examples, validation, and repair guidance.

## The message to repeat

Short version:

> Prompts ask. Validators enforce.

Longer version:

> The model writes JSON. `prompt-to-json` gives the agent the contract, validates the result, returns repair guidance when it fails, and keeps invalid JSON away from your app.

Analogy:

```text
developer writes code -> TypeScript validates it
model writes JSON     -> prompt-to-json validates it
```

## Audience

Primary audience:

- Developers building AI apps
- Agent framework users
- SaaS founders adding LLM features
- Backend engineers responsible for data quality
- MCP users looking for practical MCP use cases
- Developers searching for structured output fixes

Search intent to target:

- "how to make ChatGPT return JSON"
- "how to get valid JSON from LLM"
- "why does ChatGPT add extra fields to JSON"
- "why does JSON mode still fail"
- "how to validate LLM output"
- "how to repair invalid LLM JSON"
- "MCP structured output"
- "JSON schema LLM output"
- "function calling vs structured output"
- "OpenAI structured outputs vs JSON schema"
- "Claude JSON output"
- "Ollama structured output"

## Positioning guardrails

Say this:

- `prompt-to-json` is a local MCP contract server.
- It provides schemas, rules, examples, validation, and repair guidance.
- It does not call LLM providers.
- It does not need API keys.
- It is model-neutral.
- Your agent/model generates the JSON.
- Validation is deterministic.
- Contracts live in Git-controlled JSON files.

Do not say this:

- "prompt-to-json generates JSON for you."
- "prompt-to-json replaces your model."
- "MCP magically fixes structured output."
- "This guarantees the model understands everything correctly."

Better phrasing:

> It does not make the model perfect. It prevents invalid JSON from silently entering your app.

## Messaging pillars

### 1. Prompts are guidance, not enforcement

A prompt can say:

```text
severity must be low, medium, high, or critical
```

But a model can still output:

```json
{
  "severity": "urgent"
}
```

A validator can reject that.

Core line:

> Your prompt cannot enforce an enum.

### 2. JSON mode is not backend validation

JSON mode may produce parseable JSON. Your app needs schema-valid JSON.

Validation answers:

- Are required fields present?
- Are enum values allowed?
- Are types correct?
- Are extra fields blocked?
- Does the output match the app contract?

Core line:

> Valid JSON and valid app data are not the same thing.

### 3. MCP makes contracts agent-usable

The MCP server exposes contract and validation tools to agents:

- `list_contracts`
- `read_contract`
- `get_json_contract`
- `get_edit_contract`
- `validate_json`
- `get_repair_contract`
- `reload_contracts`
- `status`

Core line:

> MCP turns schemas into tools your agent can use.

### 4. The repair loop is the production difference

Demo flow:

```text
prompt -> model -> JSON -> app
```

Production flow:

```text
get_json_contract
  -> model generates JSON
  -> validate_json
  -> if invalid: get_repair_contract
  -> model repairs JSON
  -> validate_json again
  -> app consumes valid JSON
```

Core line:

> Bad output should trigger repair, not a production bug.

### 5. AI behavior should be Git-controlled

Contracts are files:

```text
json-contracts/support-ticket.json
json-contracts/real-estate-lead.json
json-contracts/chart-generation.json
```

That means behavior changes can use:

- pull requests
- code review
- diffs
- rollbacks
- CI validation
- audit trails

Core line:

> AI behavior should be reviewed like code, not hidden in a prompt string.

## Advantages of pushing validation to MCP

Use these as talking points in videos, docs, launches, and comparisons.

### Less prompt clutter

Instead of injecting large schemas, rules, examples, and repair instructions manually in every app prompt, the agent asks MCP for the contract payload.

Core line:

> Stop copy-pasting schema walls into prompts.

### Deterministic validation

The model can ignore or misunderstand instructions. Validation gives a hard yes/no answer.

Core line:

> The prompt asks nicely. The validator says no.

### Model neutrality

The validation layer does not belong to OpenAI, Anthropic, Google, Ollama, or any framework. The same contract can be used with different models.

Core line:

> Your model can change. Your contract should not.

### Safe repair loop

The agent can validate, request repair guidance, repair with the chosen model, and validate again before the app sees the output.

Core line:

> Your AI should run its own tests before touching your app.

### Better separation of concerns

```text
LLM  = understands language and proposes JSON
MCP  = provides contracts and validates JSON
App  = consumes validated JSON
```

Core line:

> Do not make the model responsible for being your type system.

### Discoverability for agents

Because contracts are exposed as MCP tools/resources, an agent can list available behaviors and fetch the right schema when needed.

Core line:

> MCP makes structured-output behaviors discoverable.

### Git-controlled behavior

A contract file is easier to review than a hidden prompt string. Teams can track changes to schema, rules, and examples.

Core line:

> Your AI output contract deserves a pull request.

### CI validation

Contracts can be validated and linted without starting an MCP host:

```bash
prompt-to-json validate --contracts ./json-contracts
prompt-to-json lint --strict --contracts ./json-contracts
```

Core line:

> Test your AI contracts before users do.

### Explicit context

Runtime variables belong in `context`, not hidden inside user input.

```json
{
  "input": "I want to move this summer.",
  "context": {
    "current_datetime": "2026-05-03T00:00:00Z"
  }
}
```

Core line:

> User input is input. App context is context.

### Observability and auditability

The MCP server returns deterministic `contractHash` and `schemaHash` values. Logs can capture which contract was used and why validation failed.

Core line:

> Debug AI output with hashes and validation errors, not vibes.

### Safer failure mode

Invalid output should fail closed or trigger repair instead of silently corrupting app state.

Core line:

> Invalid AI JSON should never become application state.

### No API keys in the validation layer

The MCP server does not call providers and does not need LLM API keys.

Core line:

> The thing validating your AI output should not need your AI API key.

### Dynamic behavior without MCP config churn

Adding a new contract file adds a new structured-output behavior. MCP config does not need to change.

Core line:

> Add behavior with JSON files, not framework code.

## Repeatable short-form video formula

Use this structure for most clips:

```text
0-2s: Hook the search pain or controversial belief
2-10s: Show the common broken approach
10-30s: Show the contract/validation flow
30-45s: Show the result or failure being caught
45-60s: CTA
```

Example CTA options:

- "If your AI app accepts raw model JSON, you are gambling. Use contracts."
- "Comment JSON and I will post the contract file."
- "Stop trusting model output. Validate it first."
- "Link in bio for the local MCP contract server."
- "The model writes JSON. The contract catches lies."

## Search-driven video angles

### 1. How do I make ChatGPT return valid JSON?

Title options:

- **You Cannot Prompt ChatGPT Into Valid JSON**
- **Stop Begging ChatGPT for JSON**
- **The JSON Prompt Everyone Uses Is Wrong**

Hook:

> Everyone types "return valid JSON only" and then ships broken output.

Demo:

Show a model returning:

```json
{
  "summary": "Login broken",
  "severity": "urgent"
}
```

Then show validation failing because the schema only allows:

```json
["low", "medium", "high", "critical"]
```

Punchline:

> Prompts ask. Validators enforce.

### 2. Why does ChatGPT keep adding extra fields to my JSON?

Title options:

- **Why AI Keeps Inventing JSON Fields**
- **Your LLM Is Sneaking Fields Into Your Backend**
- **This One Schema Setting Blocks AI Garbage**

Hook:

> Your model is not malicious. It just does not know your backend contract matters.

Demo:

```json
{
  "summary": "Login broken",
  "severity": "high",
  "confidence": 0.94
}
```

Then show `additionalProperties: false` rejecting `confidence`.

Punchline:

> If the field is not in the contract, it does not get into your app.

### 3. Why does JSON mode still fail?

Title options:

- **JSON Mode Is Not Validation**
- **JSON Mode Can Still Break Your App**
- **Valid JSON Can Still Be Invalid Data**

Hook:

> JSON mode can give you JSON-shaped garbage.

Visual:

```text
JSON mode asks: Is it JSON?
Validation asks: Is it the JSON my app accepts?
```

Punchline:

> Valid JSON and valid app data are not the same thing.

### 4. How do I validate LLM output before using it?

Title options:

- **Never Let AI JSON Touch Your App Before This**
- **The Missing Step in Every AI App**
- **Your AI App Needs This Gatekeeper**

Hook:

> If your app consumes raw model output, you are gambling.

Demo flow:

```text
get_json_contract
-> model generates JSON
-> validate_json
-> repair if invalid
-> app consumes valid JSON
```

Punchline:

> Your backend should only see validated JSON.

### 5. Why does my AI app break when switching models?

Title options:

- **Your Structured Output Should Not Depend on One Model**
- **Why Switching From GPT to Claude Broke Your JSON**
- **Model-Specific Prompts Are a Trap**

Hook:

> You switched models and your JSON changed. Here is why.

Angle:

If the schema and rules live in a provider-specific prompt, every model switch can become a retuning project. Contracts keep the backend shape stable.

Punchline:

> Your model can change. Your contract should not.

### 6. How do I stop LLM hallucinations in JSON?

Title options:

- **The Easiest AI Hallucination to Catch Is JSON**
- **Your LLM Hallucinated a Field. Catch It.**
- **Stop AI From Inventing Backend Data**

Hook:

> In structured output, a lot of hallucinations are just validation errors.

Examples:

- hallucinated property
- invalid enum
- wrong type
- missing required field

Punchline:

> You cannot stop every hallucination, but you can stop invalid data from entering your app.

### 7. How do I use MCP for structured output?

Title options:

- **MCP Is Perfect for This Boring Problem**
- **The MCP Use Case That Actually Makes Sense**
- **MCP Turns Schemas Into Agent Tools**

Hook:

> MCP does not need to be magical. Sometimes it just gives your agent the contract it needs.

Explain:

```text
MCP does not generate the JSON.
The model generates the JSON.
MCP validates the JSON.
```

Punchline:

> MCP turns schemas into tools your agent can actually use.

### 8. How do I repair invalid LLM JSON?

Title options:

- **The AI JSON Repair Loop Most Demos Skip**
- **Bad AI JSON Should Trigger Repair, Not a Crash**
- **Do This When Your LLM Returns Broken JSON**

Hook:

> The first model output is not the final output.

Demo flow:

```text
invalid JSON
-> validate_json fails
-> get_repair_contract
-> model repairs JSON
-> validate_json passes
```

Punchline:

> Bad output should trigger repair, not a production bug.

### 9. Why do prompts fail at structured output?

Title options:

- **Your Prompt Is Pretending to Be a Type System**
- **Stop Making English Do a Compiler's Job**
- **Prompt Engineering Is Not Validation**

Hook:

> You are asking English text to do the job of a compiler.

Comparison:

```text
Bad:
Prompt says: use only these fields.

Good:
Schema says: these are the only fields.
Validator enforces it.
```

Punchline:

> Prompting is guidance. Validation is enforcement.

### 10. How do I make AI output production-ready JSON?

Title options:

- **The Difference Between Demo AI and Production AI**
- **Demo AI Prints JSON. Production AI Validates It.**
- **If There Is No Validation Step, It Is a Demo**

Hook:

> Demo AI prints JSON. Production AI validates it.

Visual:

```text
Demo:
prompt -> model -> JSON -> app

Production:
contract -> model -> validate -> repair -> validate -> app
```

Punchline:

> If there is no validation step, it is a demo.

### 11. How do I version AI prompts or AI behavior?

Title options:

- **Your AI Behavior Should Go Through Pull Requests**
- **Why Is Your AI Prompt Not in Git?**
- **Stop Hiding AI Behavior in Prompt Strings**

Hook:

> Your database schema is in Git. Why is your AI behavior hidden in a prompt string?

Demo:

Show a contract file:

```text
json-contracts/support-ticket.json
```

Then show:

```text
git diff
pull request
rollback
CI validation
```

Punchline:

> AI behavior should be reviewed like code.

### 12. How do I pass context to an LLM safely?

Title options:

- **Stop Smuggling Hidden Variables Into Prompts**
- **Your User Prompt Is Not a Junk Drawer**
- **LLM Context Should Not Be String Concatenation**

Hook:

> App variables do not belong hidden inside the user prompt.

Bad:

```text
User: I want to move this summer.
Hidden appended text: current date is 2026-05-03...
```

Better:

```json
{
  "input": "I want to move this summer.",
  "context": {
    "current_datetime": "2026-05-03T00:00:00Z"
  }
}
```

Punchline:

> User input is input. App context is context.

## 30-video backlog

| # | Title | Search target | Demo idea |
|---:|---|---|---|
| 1 | Your AI JSON Is Broken. You Just Have Not Noticed. | LLM JSON output | Show an invalid enum that looks plausible. |
| 2 | Stop Begging ChatGPT for JSON | ChatGPT output JSON | Replace a giant prompt with a contract flow. |
| 3 | JSON Mode Is Not a Backend | JSON mode | Show parseable JSON that violates schema. |
| 4 | Regexing LLM Output Is a Crime | parse LLM output | Replace regex parsing with validation. |
| 5 | The Missing Step in Every AI App | validate LLM output | Add `validate_json` before app consumption. |
| 6 | This Is TypeScript for AI JSON | structured outputs | Compare TypeScript and schema validation. |
| 7 | Your Prompt Cannot Enforce This | JSON schema enum | Model returns `urgent`; validator rejects. |
| 8 | One JSON File Replaces 500 Lines of Glue Code | structured output framework | Add a contract file and use it immediately. |
| 9 | The AI Output Parser Nobody Talks About | AI output parser | Show contract registry + validator. |
| 10 | Never Trust AI JSON Until This Says True | JSON validation | Show `{ "valid": true }`. |
| 11 | The Repair Loop That Saves Your App | repair LLM JSON | Validate, repair, validate again. |
| 12 | Function Calling vs JSON Schema: Stop Confusing Them | function calling | Tool choice is not final data validation. |
| 13 | OpenAI, Claude, Ollama: Same Contract | multi-model structured output | Same contract with different providers. |
| 14 | No API Keys? For an AI Tool? | local MCP | Explain server does not call providers. |
| 15 | MCP Is Not Magic. This Is What It Actually Does. | MCP server | Show contract, validation, repair tools. |
| 16 | Add a New AI Behavior Without Touching MCP Config | MCP contracts | Add `json-contracts/new-file.json`. |
| 17 | Stop Hiding System Variables in Prompts | LLM context | Use `context`. |
| 18 | This Tiny Rule Prevents Garbage JSON | `additionalProperties:false` | Block surprise fields. |
| 19 | Your Enum Is Useless Without Validation | JSON schema enum | Show enum failure. |
| 20 | Turn Angry Emails Into Support Tickets | support automation | Use `support-ticket`. |
| 21 | Plain English to API Filters in 30 Seconds | natural language API query | Use `create-filter`. |
| 22 | Build Charts From Text Without Prompt Soup | chart generation | Use `chart-generation`. |
| 23 | Real Estate Leads From One Sentence | CRM extraction | Use `real-estate-lead`. |
| 24 | Ecommerce Returns Without Support Chaos | ecommerce support | Use `ecommerce-return`. |
| 25 | Healthcare Intake Needs More Than JSON Mode | patient intake | Use `patient-intake`. |
| 26 | Edit JSON With Natural Language, But Safely | edit JSON with AI | Use `get_edit_contract`. |
| 27 | Your AI Behavior Should Go Through Pull Requests | prompt version control | Show Git-controlled contracts. |
| 28 | CI for Prompts? Kind Of. | validate schema CI | Run `prompt-to-json validate`. |
| 29 | The Schema Hash Nobody Uses But Should | audit logging | Explain `contractHash` and `schemaHash`. |
| 30 | The MCP Tool That Refuses to Call an LLM | MCP local server | Contrarian no-provider-key angle. |

## 6-week release schedule

### Week 1: pain and controversy

Goal: get clicks from developers with broken structured output.

1. Your AI JSON Is Broken. You Just Have Not Noticed.
2. Stop Begging ChatGPT for JSON
3. JSON Mode Is Not a Backend
4. Regexing LLM Output Is a Crime
5. The Missing Step in Every AI App

### Week 2: mental model

Goal: make the product category obvious.

6. This Is TypeScript for AI JSON
7. Your Prompt Cannot Enforce This
8. One JSON File Replaces 500 Lines of Glue Code
9. The AI Output Parser Nobody Talks About
10. Never Trust AI JSON Until This Says True

### Week 3: MCP, repair, and model neutrality

Goal: show the actual system design.

11. The Repair Loop That Saves Your App
12. Function Calling vs JSON Schema: Stop Confusing Them
13. OpenAI, Claude, Ollama: Same Contract
14. No API Keys? For an AI Tool?
15. MCP Is Not Magic. This Is What It Actually Does.

### Week 4: practical demos

Goal: make the value concrete.

16. Turn Angry Emails Into Support Tickets
17. Plain English to API Filters in 30 Seconds
18. Build Charts From Text Without Prompt Soup
19. Real Estate Leads From One Sentence
20. Ecommerce Returns Without Support Chaos

### Week 5: production engineering

Goal: appeal to serious builders.

21. Healthcare Intake Needs More Than JSON Mode
22. Edit JSON With Natural Language, But Safely
23. Your AI Behavior Should Go Through Pull Requests
24. CI for Prompts? Kind Of.
25. The Schema Hash Nobody Uses But Should

### Week 6: comparison and hot takes

Goal: capture adjacent-tool search traffic.

26. You Might Not Need LangChain for Structured Output
27. BAML? DSL? Or Just JSON Schema?
28. Zod Is Great, But Your Agent Still Needs a Loop
29. Structured Output Is Not Prompt Engineering
30. The MCP Tool That Refuses to Call an LLM

## Short scripts

### Script: JSON Mode Is Not Validation

Hook:

> JSON mode is not a backend contract.

Body:

> JSON mode can make the model return JSON-shaped text. But your app needs more than that. Is `severity` actually one of your allowed enum values? Are extra fields blocked? Did the model forget a required property?

Show invalid output:

```json
{
  "summary": "Login broken",
  "severity": "urgent"
}
```

Show validation failure:

```text
/severity must be equal to one of the allowed values
```

Close:

> Use the model to write JSON. Use a contract to validate it.

### Script: This Is TypeScript for AI JSON

Hook:

> You do not trust JavaScript without TypeScript. Why trust AI JSON without a schema?

Body:

> Developers write code. TypeScript validates it. Same idea here: the model writes JSON, and `prompt-to-json` validates it against your contract.

Visual:

```text
developer writes code -> TypeScript validates
model writes JSON     -> prompt-to-json validates
```

Close:

> Structured output is not just prompting. It is contracts.

### Script: The Repair Loop Most Demos Skip

Hook:

> This is the part most AI demos skip.

Body:

> The model returns bad JSON. Most apps either crash or silently accept garbage. Instead, validate it. If it fails, ask for a repair contract, give that back to the model, and validate again.

Visual:

```text
get_json_contract
  -> model generates JSON
  -> validate_json
  -> if invalid: get_repair_contract
  -> repair and validate again
```

Close:

> Never skip validation.

### Script: Your Prompt Is Pretending to Be a Type System

Hook:

> Your prompt is pretending to be a type system.

Body:

> If your prompt says "only return these fields," the model can still add more. If your prompt says "severity must be high or low," the model can still invent `urgent`. English is guidance. Schema validation is enforcement.

Close:

> Stop making prompts do the validator's job.

## Visual patterns

Use fast repeated visuals so viewers recognize the brand.

Bad approach card:

```text
prompt -> model -> raw JSON -> app
```

Good approach card:

```text
contract -> model -> validate -> repair -> app
```

Common overlays:

- BROKEN
- INVALID ENUM
- EXTRA FIELD
- MISSING REQUIRED FIELD
- VALIDATED
- NO API KEYS
- LOCAL MCP
- GIT-CONTROLLED CONTRACTS
- FAIL CLOSED

Terminal shots:

```bash
npx prompt-to-json
prompt-to-json validate --contracts ./json-contracts
prompt-to-json lint --strict --contracts ./json-contracts
```

MCP tool shots:

```text
get_json_contract
validate_json
get_repair_contract
get_edit_contract
```

## Best contracts for demos

Use the example contracts that are easiest to understand in a short clip.

1. `support-ticket`
   - Best for urgency, severity, and category.
   - Great invalid enum demo: `urgent` vs `critical`.
2. `create-filter`
   - Best for natural language to API filters.
   - Great edit demo: "last 20 closed tickets".
3. `real-estate-lead`
   - Best for real-world extraction from messy input.
   - Great context demo with `current_datetime`.
4. `ecommerce-return`
   - Relatable to non-developers.
5. `chart-generation`
   - Visually strong for dashboards and BI.

## Title formulas

Use titles that match search intent and contain a clear conflict.

```text
How do I {goal}? -> You are doing {goal} wrong
Why does {tool} {bad behavior}? -> The hidden reason {tool} fails
Stop {common workaround} -> Do {contract/validation thing} instead
{Popular feature} is not {production requirement}
The missing step in every {AI app / LLM workflow}
```

Examples:

- How do I make ChatGPT return JSON? -> Stop Begging ChatGPT for JSON
- Why does JSON mode fail? -> JSON Mode Is Not Validation
- How do I validate LLM output? -> Never Let AI JSON Touch Your App Before This
- Why does my model add fields? -> Why AI Keeps Inventing JSON Fields
- How do I use MCP? -> MCP Is Perfect for This Boring Problem

## Description templates

General SEO description:

```text
Stop trusting raw LLM JSON. This shows how to use JSON Schema contracts, validation, and MCP tools to get reliable structured output from AI models like ChatGPT, Claude, Ollama, and more.

#AI #LLM #PromptEngineering #StructuredOutputs #JSONSchema #MCP #OpenAI #Claude #Coding
```

Product-specific description:

```text
prompt-to-json is a local MCP contract server for schema-valid JSON output. The model generates JSON. prompt-to-json provides the contract, validation, and repair guidance.

#prompttojson #MCP #JSONSchema #LLM #AIEngineering #StructuredOutputs
```

Comparison video description:

```text
JSON mode, function calling, and prompt instructions are not the same as app-level validation. Production AI apps should validate model output against a real schema before consuming it.

#OpenAI #Claude #LLM #JSONMode #StructuredOutputs #MCP
```

## Hashtag bank

Use 3-6 per post. Do not overload.

```text
#AI
#LLM
#MCP
#JSONSchema
#StructuredOutputs
#PromptEngineering
#OpenAI
#Claude
#Ollama
#TypeScript
#AIEngineering
#Coding
#BackendDevelopment
#Agents
#DeveloperTools
```

## Production checklist

Before recording:

- Pick one search-intent question.
- Pick one broken example.
- Pick one contract/demo.
- Decide the one-line punchline.
- Keep the product mention short until the payoff.

During editing:

- Show the failure in the first 5 seconds.
- Use captions for every spoken line.
- Keep code snippets large and minimal.
- Use red for invalid and green for valid.
- Repeat the contract flow visually.

Before publishing:

- Put the search phrase in the title or first sentence.
- Include `JSON`, `LLM`, `structured output`, or `MCP` in the description.
- Pin a comment with the contract flow.
- Ask a specific comment prompt such as: "Want the support-ticket contract? Comment JSON."

## Pinned comment templates

```text
The loop:
get_json_contract -> model generates JSON -> validate_json -> repair if invalid -> validate again -> app consumes valid JSON.
```

```text
Important: prompt-to-json does not call an LLM. Your agent/model generates the JSON. prompt-to-json provides the contract and validation.
```

```text
The key idea: prompts are guidance, validation is enforcement.
```

## Launch recommendation

Lead with pain, not product.

Do not start with:

> What is prompt-to-json?

Start with:

> JSON mode is not validation.

Then show why developers need a contract and validation loop.

The strongest repeating narrative:

```text
Bad AI apps trust model output.
Good AI apps validate it.
Great AI apps make structured output Git-controlled.
```
