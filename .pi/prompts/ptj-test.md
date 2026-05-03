Use prompt-to-json to convert this natural-language request into valid JSON.

Contract: {{contract}}
Input: {{input}}

Required flow:
1. Call `ptj_get_json_contract` with the contract and input.
2. Generate JSON yourself using the returned schema, rules, examples, and instructions.
3. Call `ptj_validate_json` with the generated JSON.
4. If validation fails, call `ptj_get_repair_contract`, repair the JSON yourself, and call `ptj_validate_json` again.
5. Return the final valid JSON and a short validation summary.
