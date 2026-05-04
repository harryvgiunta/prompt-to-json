# Contributing to prompt-to-json

Thank you for contributing to prompt-to-json. This project is a local MCP contract server for natural-language-to-JSON workflows.

## Project owner

The project owner is **Harry Giunta**.

## Development setup

From the repository root:

```bash
npm install
npm test
npm run build
```

To run the Studio demo:

```bash
npm run studio
```

To run the MCP stdio server locally:

```bash
npm run dev
```

## Pull request checklist

Before opening a pull request, please:

1. Run `npm test`.
2. Run `npm run build`.
3. Keep changes focused and easy to review.
4. Update docs when changing user-facing behavior.
5. Add or update tests for behavior changes.
6. Do not commit real API keys, `.env` files, local logs, or provider credentials.

## Contract contribution guidelines

Contracts live in `json-contracts/` and are plain JSON files.

When adding or editing official starter contracts:

- keep the JSON Schema valid;
- keep examples small and realistic;
- include examples for both create and edit operations when useful;
- do not include real personal, customer, patient, legal, financial, or secret data;
- do not include provider-specific prompts or hidden executable behavior;
- do not add a `version` field; use Git history instead;
- keep operation metadata at the top level, not inside the JSON Schema; and
- validate outputs against the contract schema.

A typical contract shape is:

```json
{
  "description": "Convert natural language into a structured object.",
  "rules": [],
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
        "Preserve all unspecified fields exactly."
      ],
      "examples": []
    }
  },
  "schema": {},
  "examples": []
}
```

If `operations` is omitted, the runtime treats both `create` and `edit` as enabled by default.

## Licensing of contributions

Unless you clearly mark a contribution otherwise before it is merged:

- runtime code, docs, examples, tests, and project infrastructure are contributed under **Apache-2.0**;
- official starter contracts in `json-contracts/` are contributed under **Apache-2.0 OR MIT**, at the user's option; and
- third-party marketplace packs, if accepted or linked, may use creator-selected licenses, but they must include clear license metadata and must not conflict with the rights needed to distribute them.

Do not submit code, schemas, examples, text, or assets unless you have the right to contribute them under the applicable license.

## Marketplace packs

Marketplace packs are not the same thing as official starter contracts.

A marketplace pack should include:

- a clear pack owner or maintainer;
- a clear license, chosen by the pack creator;
- any required notices or attribution;
- a distinct pack name; and
- no confusing implication that the pack is official, certified, or endorsed unless Harry Giunta has approved it.

## Trademark policy

The project name **prompt-to-json** is subject to the project trademark policy in [`TRADEMARKS.md`](TRADEMARKS.md). Copyright licenses do not grant trademark rights.

You may truthfully say that a project, fork, or pack is compatible with prompt-to-json, but do not imply official status, certification, sponsorship, or endorsement without permission from Harry Giunta.

## Security and sensitive data

Do not open public issues or pull requests containing secrets, private keys, production provider tokens, real medical records, real legal client facts, real customer data, or other sensitive data.

If a security issue is suspected, report it through the official project contact channel or repository security process when available.

## Code style

This project uses TypeScript for the runtime and plain JSON for contracts. Prefer small, explicit functions and tests over framework-heavy abstractions.

For file edits:

- keep generated build output out of source commits unless release packaging requires it;
- keep docs concise and accurate;
- avoid introducing provider SDK dependencies into the MCP stdio server; and
- preserve the core design: the MCP server provides contracts and validation, while the selected model or agent generates JSON.
