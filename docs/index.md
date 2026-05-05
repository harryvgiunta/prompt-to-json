---
title: prompt-to-json Docs
description: Documentation, integration notes, and content strategy for prompt-to-json.
---

# prompt-to-json Docs

`prompt-to-json` is a local MCP contract server for reliable structured JSON output.

It does not call an LLM provider and it does not generate JSON by itself. Your agent/model generates or repairs JSON. `prompt-to-json` provides the contract, validation, and repair guidance.

Core mental model:

```text
model writes JSON -> prompt-to-json validates it -> app consumes valid JSON
```

## Documentation

- [Main README](https://github.com/harryvgiunta/prompt-to-json#readme)
- [Pi local integration](./pi-integration.md)
- [YouTube content marketing plan](./content-marketing-plan.md)
- [GitHub Pages setup](./github-pages.md)

## Product positioning

The short version:

> Prompts ask. Validators enforce.

The longer version:

> Most developers think structured output is a prompting problem. It is actually a contract and validation problem.

Analogy:

```text
developer writes code -> TypeScript validates it
model writes JSON     -> prompt-to-json validates it
```

## Correct runtime flow

```text
get_json_contract
  -> model generates JSON
  -> validate_json
  -> if invalid: get_repair_contract
  -> model repairs JSON
  -> validate_json again
  -> app consumes valid JSON
```

## Why MCP?

Pushing contracts and validation into MCP gives agents a consistent local tool layer for structured output:

- fewer prompt walls
- deterministic schema validation
- model-neutral contracts
- create/edit/repair workflows
- Git-controlled behavior
- CI validation and linting
- explicit `context` passing
- contract and schema hashes for logging
- no LLM API keys in the validation layer

## Useful commands

```bash
npm install -g prompt-to-json
npx prompt-to-json
prompt-to-json validate --contracts ./json-contracts
prompt-to-json lint --strict --contracts ./json-contracts
```

## Content thesis

The content strategy in this repo is built around one repeatable point:

```text
Bad AI apps trust model output.
Good AI apps validate it.
Great AI apps make structured output Git-controlled.
```
