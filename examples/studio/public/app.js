const elements = {
  modeTabs: [...document.querySelectorAll(".tab-button")],
  manualModePanel: document.querySelector("#manualModePanel"),
  llmModePanel: document.querySelector("#llmModePanel"),
  contractSelect: document.querySelector("#contractSelect"),
  reloadContracts: document.querySelector("#reloadContracts"),
  contractDescription: document.querySelector("#contractDescription"),
  rulesList: document.querySelector("#rulesList"),
  schemaPreview: document.querySelector("#schemaPreview"),
  examplesPreview: document.querySelector("#examplesPreview"),
  sourceInput: document.querySelector("#sourceInput"),
  contextInput: document.querySelector("#contextInput"),
  jsonOutput: document.querySelector("#jsonOutput"),
  useExampleInput: document.querySelector("#useExampleInput"),
  useExampleOutput: document.querySelector("#useExampleOutput"),
  useInvalidExample: document.querySelector("#useInvalidExample"),
  buildContract: document.querySelector("#buildContract"),
  copyJsonContract: document.querySelector("#copyJsonContract"),
  jsonContractStatus: document.querySelector("#jsonContractStatus"),
  jsonContractPayload: document.querySelector("#jsonContractPayload"),
  validateJson: document.querySelector("#validateJson"),
  validationStatus: document.querySelector("#validationStatus"),
  validationErrors: document.querySelector("#validationErrors"),
  validationPayload: document.querySelector("#validationPayload"),
  buildRepair: document.querySelector("#buildRepair"),
  copyRepair: document.querySelector("#copyRepair"),
  repairStatus: document.querySelector("#repairStatus"),
  repairPayload: document.querySelector("#repairPayload"),
  llmProvider: document.querySelector("#llmProvider"),
  llmModel: document.querySelector("#llmModel"),
  llmThinking: document.querySelector("#llmThinking"),
  llmApiKey: document.querySelector("#llmApiKey"),
  llmBaseUrl: document.querySelector("#llmBaseUrl"),
  llmSaveConfig: document.querySelector("#llmSaveConfig"),
  llmSaveAsDefault: document.querySelector("#llmSaveAsDefault"),
  clearApiKey: document.querySelector("#clearApiKey"),
  llmConfigStatus: document.querySelector("#llmConfigStatus"),
  llmSourceInput: document.querySelector("#llmSourceInput"),
  llmContextInput: document.querySelector("#llmContextInput"),
  llmUseExampleInput: document.querySelector("#llmUseExampleInput"),
  llmGenerate: document.querySelector("#llmGenerate"),
  llmJsonOutput: document.querySelector("#llmJsonOutput"),
  llmValidate: document.querySelector("#llmValidate"),
  llmRepair: document.querySelector("#llmRepair"),
  llmCopyJson: document.querySelector("#llmCopyJson"),
  llmOutputStatus: document.querySelector("#llmOutputStatus"),
  llmValidationErrors: document.querySelector("#llmValidationErrors"),
  llmPayload: document.querySelector("#llmPayload"),
  toast: document.querySelector("#toast")
};

const state = {
  mode: "llm",
  contracts: [],
  currentContract: null,
  llmConfig: null,
  providers: [],
  lastJsonContract: null,
  lastValidation: null,
  lastRepairContract: null,
  lastLlmValidation: null,
  lastLlmResult: null
};

wireEvents();
await loadLlmProviders();
await loadContracts();

function wireEvents() {
  for (const tab of elements.modeTabs) {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
  }

  elements.reloadContracts.addEventListener("click", async () => {
    await reloadContracts();
  });

  elements.contractSelect.addEventListener("change", async () => {
    await loadContractDetails(elements.contractSelect.value);
  });

  elements.useExampleInput.addEventListener("click", () => {
    const example = firstExample();
    if (!example) return toast("No example input for this contract.");
    const text = formatInputValue(example.input);
    elements.sourceInput.value = text;
    if (!elements.llmSourceInput.value.trim()) elements.llmSourceInput.value = text;
    updateButtonState();
  });

  elements.useExampleOutput.addEventListener("click", () => {
    const example = firstExample();
    if (!example || example.output === undefined) return toast("No example JSON for this contract.");
    const json = pretty(example.output);
    elements.jsonOutput.value = json;
    elements.llmJsonOutput.value = json;
    clearValidationState();
    clearRepairState();
    clearLlmValidationState();
  });

  elements.useInvalidExample.addEventListener("click", () => {
    const json = pretty(makeInvalidExample());
    elements.jsonOutput.value = json;
    elements.llmJsonOutput.value = json;
    clearValidationState();
    clearRepairState();
    clearLlmValidationState();
    toast("Inserted an intentionally invalid JSON sample.");
  });

  elements.buildContract.addEventListener("click", async () => {
    await buildJsonContract();
  });

  elements.copyJsonContract.addEventListener("click", async () => {
    if (state.lastJsonContract) await copyText(pretty(state.lastJsonContract), "Copied JSON contract payload.");
  });

  elements.validateJson.addEventListener("click", async () => {
    await validateManualJson();
  });

  elements.buildRepair.addEventListener("click", async () => {
    await buildRepairContract();
  });

  elements.copyRepair.addEventListener("click", async () => {
    if (state.lastRepairContract) await copyText(pretty(state.lastRepairContract), "Copied repair payload.");
  });

  elements.llmProvider.addEventListener("change", () => {
    applySelectedProviderDefaults();
    renderLlmConfigStatus();
    updateButtonState();
  });

  for (const input of [elements.llmModel, elements.llmThinking, elements.llmApiKey, elements.llmBaseUrl, elements.llmSourceInput, elements.llmJsonOutput]) {
    input.addEventListener("input", () => {
      renderLlmConfigStatus();
      updateButtonState();
    });
  }

  elements.llmSaveConfig.addEventListener("change", () => {
    if (!elements.llmSaveConfig.checked) elements.llmSaveAsDefault.checked = false;
    renderLlmConfigStatus();
    updateButtonState();
  });

  elements.llmSaveAsDefault.addEventListener("change", () => {
    if (elements.llmSaveAsDefault.checked) elements.llmSaveConfig.checked = true;
    renderLlmConfigStatus();
    updateButtonState();
  });

  elements.clearApiKey.addEventListener("click", () => {
    elements.llmApiKey.value = "";
    renderLlmConfigStatus();
    updateButtonState();
    toast("Cleared API key from this browser session.");
  });

  elements.llmUseExampleInput.addEventListener("click", () => {
    const example = firstExample();
    if (!example) return toast("No example input for this contract.");
    const text = formatInputValue(example.input);
    elements.llmSourceInput.value = text;
    if (!elements.sourceInput.value.trim()) elements.sourceInput.value = text;
    updateButtonState();
  });

  elements.llmGenerate.addEventListener("click", async () => {
    await generateWithLlm();
  });

  elements.llmValidate.addEventListener("click", async () => {
    await validateLlmJson();
  });

  elements.llmRepair.addEventListener("click", async () => {
    await repairWithLlm();
  });

  elements.llmCopyJson.addEventListener("click", async () => {
    const text = elements.llmJsonOutput.value.trim();
    if (text) await copyText(text, "Copied generated JSON.");
  });
}

function switchMode(mode) {
  if (!mode || mode === state.mode) return;
  state.mode = mode;

  for (const tab of elements.modeTabs) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  }

  elements.manualModePanel.classList.toggle("hidden", mode !== "manual");
  elements.llmModePanel.classList.toggle("hidden", mode !== "llm");

  if (mode === "llm" && !elements.llmSourceInput.value.trim() && elements.sourceInput.value.trim()) {
    elements.llmSourceInput.value = elements.sourceInput.value.trim();
  }

  if (mode === "llm" && !elements.llmContextInput.value.trim() && elements.contextInput.value.trim()) {
    elements.llmContextInput.value = elements.contextInput.value.trim();
  }

  if (mode === "manual" && !elements.sourceInput.value.trim() && elements.llmSourceInput.value.trim()) {
    elements.sourceInput.value = elements.llmSourceInput.value.trim();
  }

  if (mode === "manual" && !elements.contextInput.value.trim() && elements.llmContextInput.value.trim()) {
    elements.contextInput.value = elements.llmContextInput.value.trim();
  }

  updateButtonState();
}

async function loadLlmProviders() {
  try {
    const config = await api("/api/llm/providers");
    state.llmConfig = config;
    state.providers = config.providers ?? [];
    renderProviderOptions();
    renderThinkingOptions(config.thinkingLevels ?? ["off", "low", "medium", "high", "xhigh", "auto"]);
    applySelectedProviderDefaults();
    renderLlmConfigStatus();
  } catch (error) {
    state.llmConfig = { providers: [], defaultThinking: "medium" };
    state.providers = [];
    setStatus(elements.llmConfigStatus, "bad", messageFor(error));
  }

  updateButtonState();
}

function renderProviderOptions(options = {}) {
  const previous = options.preferredProvider ?? elements.llmProvider.value;
  elements.llmProvider.innerHTML = "";

  for (const provider of state.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    elements.llmProvider.append(option);
  }

  const defaultProvider = state.llmConfig?.defaultProvider;
  if (state.providers.some((provider) => provider.id === previous)) {
    elements.llmProvider.value = previous;
  } else if (state.providers.some((provider) => provider.id === defaultProvider)) {
    elements.llmProvider.value = defaultProvider;
  } else if (state.providers[0]) {
    elements.llmProvider.value = state.providers[0].id;
  }
}

function renderThinkingOptions(levels, options = {}) {
  const previous = options.preferredThinking ?? (elements.llmThinking.value || state.llmConfig?.defaultThinking || "medium");
  elements.llmThinking.innerHTML = "";

  for (const level of levels) {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = level === "auto" ? "auto/omit" : level;
    elements.llmThinking.append(option);
  }

  elements.llmThinking.value = levels.includes(previous) ? previous : state.llmConfig?.defaultThinking || "medium";
}

function applySelectedProviderDefaults() {
  const provider = selectedProvider();
  if (!provider) return;

  elements.llmModel.value = provider.defaultModel || "";
  elements.llmBaseUrl.value = "";
  updateLlmBaseUrlPlaceholder(provider);
  elements.llmThinking.value = provider.defaultThinking || state.llmConfig?.defaultThinking || "medium";
}

function updateLlmBaseUrlPlaceholder(provider = selectedProvider()) {
  if (!provider) return;
  elements.llmBaseUrl.placeholder = provider.defaultBaseUrl
    ? `Default: ${provider.defaultBaseUrl}`
    : "Required for custom OpenAI-compatible providers, e.g. https://api.example.com/v1";
}

function renderLlmConfigStatus() {
  const provider = selectedProvider();
  if (!provider) {
    return setStatus(elements.llmConfigStatus, "bad", "No LLM providers are available.");
  }

  const hasKey = Boolean(elements.llmApiKey.value.trim()) || provider.hasApiKey || !provider.requiresApiKey;
  const keyText = provider.requiresApiKey
    ? (elements.llmApiKey.value.trim() ? "using pasted key" : provider.hasApiKey ? "using .env key" : "paste an API key")
    : "no key required";
  const thinkingText = provider.supportsThinking
    ? `Thinking: ${elements.llmThinking.value || provider.defaultThinking}.`
    : "Thinking may be ignored by this provider.";
  const modelText = elements.llmModel.value.trim() || provider.defaultModel || "enter a model";
  const hasBaseUrl = Boolean(elements.llmBaseUrl.value.trim() || provider.defaultBaseUrl);
  const baseUrlText = elements.llmBaseUrl.value.trim()
    ? `Base URL override: ${elements.llmBaseUrl.value.trim()}.`
    : provider.defaultBaseUrl
      ? `Base URL: provider default.`
      : "Base URL: enter one in Advanced settings.";
  const saveText = elements.llmSaveConfig.checked
    ? elements.llmSaveAsDefault.checked
      ? "Save enabled: writes this provider config to .env and makes it the default."
      : "Save enabled: writes this provider config to .env."
    : "Save off: nothing will be written.";

  setStatus(
    elements.llmConfigStatus,
    hasKey && hasBaseUrl ? "good" : "info",
    `${provider.label}: ${keyText}. Model: ${modelText}. ${thinkingText} ${baseUrlText} ${saveText}`
  );
}

async function loadContracts(options = {}) {
  const { forceExampleValues = false } = options;
  setStatus(elements.jsonContractStatus, "info", "Loading contracts…");

  try {
    const result = await api("/api/contracts");
    state.contracts = result.contracts ?? [];
    renderContractOptions();

    if (state.contracts.length === 0) {
      state.currentContract = null;
      elements.contractDescription.textContent = "No contracts loaded. Add .json files to json-contracts/ and click Reload.";
      setStatus(elements.jsonContractStatus, "bad", "No contracts are available.");
      updateButtonState();
      return;
    }

    const selected = elements.contractSelect.value || state.contracts[0].name;
    await loadContractDetails(selected, { forceExampleValues });
    hideStatus(elements.jsonContractStatus);
  } catch (error) {
    setStatus(elements.jsonContractStatus, "bad", messageFor(error));
  }
}

async function reloadContracts() {
  setStatus(elements.jsonContractStatus, "info", "Reloading contracts from disk…");

  try {
    await api("/api/reload", { method: "POST", body: {} });
    await loadContracts({ forceExampleValues: true });
    toast("Contracts reloaded. Example fields refreshed.");
  } catch (error) {
    setStatus(elements.jsonContractStatus, "bad", messageFor(error));
  }
}

function renderContractOptions() {
  const previous = elements.contractSelect.value;
  elements.contractSelect.innerHTML = "";

  for (const contract of state.contracts) {
    const option = document.createElement("option");
    option.value = contract.name;
    option.textContent = contract.name;
    elements.contractSelect.append(option);
  }

  if (state.contracts.some((contract) => contract.name === previous)) {
    elements.contractSelect.value = previous;
  }
}

async function loadContractDetails(contractName, options = {}) {
  const { forceExampleValues = false } = options;
  if (!contractName) return;

  try {
    const contract = await api(`/api/contracts/${encodeURIComponent(contractName)}`);
    state.currentContract = contract;
    elements.contractSelect.value = contract.contract;
    renderContractDetails(contract, { forceExampleValues });
    clearContractPayloadState();
    clearValidationState();
    clearRepairState();
    clearLlmValidationState();
  } catch (error) {
    elements.contractDescription.textContent = messageFor(error);
    updateButtonState();
  }
}

function renderContractDetails(contract, options = {}) {
  const { forceExampleValues = false } = options;
  elements.contractDescription.textContent = contract.description || "No description provided.";
  elements.rulesList.innerHTML = "";

  if (contract.rules?.length) {
    for (const rule of contract.rules) {
      const item = document.createElement("li");
      item.textContent = rule;
      elements.rulesList.append(item);
    }
  } else {
    const item = document.createElement("li");
    item.textContent = "No extra rules.";
    elements.rulesList.append(item);
  }

  elements.schemaPreview.textContent = pretty(contract.schema ?? {});
  elements.examplesPreview.textContent = pretty(contract.examples ?? []);

  const example = firstExample();
  if (example?.input !== undefined) {
    const text = formatInputValue(example.input);
    if (forceExampleValues || !elements.sourceInput.value.trim()) elements.sourceInput.value = text;
    if (forceExampleValues || !elements.llmSourceInput.value.trim()) elements.llmSourceInput.value = text;
  }

  if (example?.output !== undefined) {
    const json = pretty(example.output);
    if (forceExampleValues || !elements.jsonOutput.value.trim()) elements.jsonOutput.value = json;
    if (forceExampleValues || !elements.llmJsonOutput.value.trim()) elements.llmJsonOutput.value = json;
  }

  updateButtonState();
}

async function buildJsonContract() {
  const contract = selectedContractName();
  const input = elements.sourceInput.value.trim();

  if (!contract) return setStatus(elements.jsonContractStatus, "bad", "Select a contract first.");
  if (!input) return setStatus(elements.jsonContractStatus, "bad", "Paste a natural-language input first.");

  const context = parseContextFromTextarea(elements.contextInput.value);
  if (!context.ok) return setStatus(elements.jsonContractStatus, "bad", context.error);

  setStatus(elements.jsonContractStatus, "info", "Calling get_json_contract…");

  try {
    const payload = await api("/api/json-contract", {
      method: "POST",
      body: {
        contract,
        input,
        context: withStudioContext(context.value, {
          mode: "manual",
          note: "Give this payload to your chosen model. Paste the JSON result back into the Studio for validation."
        })
      }
    });

    state.lastJsonContract = payload;
    elements.jsonContractPayload.classList.remove("placeholder");
    elements.jsonContractPayload.textContent = pretty(payload);
    setStatus(elements.jsonContractStatus, "good", "Contract payload ready. Copy it into any model or agent.");
    updateButtonState();
  } catch (error) {
    setStatus(elements.jsonContractStatus, "bad", messageFor(error));
  }
}

async function validateManualJson() {
  const contract = selectedContractName();
  if (!contract) return setStatus(elements.validationStatus, "bad", "Select a contract first.");

  const parsed = parseJsonFromTextarea(elements.jsonOutput.value);
  if (!parsed.ok) {
    clearValidationState(false);
    return setStatus(elements.validationStatus, "bad", parsed.error);
  }

  setStatus(elements.validationStatus, "info", "Calling validate_json…");

  try {
    const result = await validateContractJson(contract, parsed.value);
    state.lastValidation = result;
    elements.validationPayload.classList.remove("placeholder");
    elements.validationPayload.textContent = pretty(result);
    renderValidationErrors(elements.validationErrors, result.errors ?? []);

    if (result.valid) {
      setStatus(elements.validationStatus, "good", "Valid JSON. This object matches the contract.");
      clearRepairState();
    } else {
      resetRepairPayload();
      setStatus(elements.validationStatus, "bad", "Invalid JSON. Get a repair contract next.");
    }

    updateButtonState();
  } catch (error) {
    setStatus(elements.validationStatus, "bad", messageFor(error));
  }
}

async function buildRepairContract() {
  const contract = selectedContractName();
  if (!contract) return setStatus(elements.repairStatus, "bad", "Select a contract first.");

  const parsed = parseJsonFromTextarea(elements.jsonOutput.value);
  if (!parsed.ok) return setStatus(elements.repairStatus, "bad", parsed.error);

  const validationErrors = state.lastValidation?.valid === false ? state.lastValidation.errors : [];
  setStatus(elements.repairStatus, "info", "Calling get_repair_contract…");

  try {
    const payload = await api("/api/repair-contract", {
      method: "POST",
      body: {
        contract,
        invalidJson: parsed.value,
        validationErrors
      }
    });

    state.lastRepairContract = payload;
    elements.repairPayload.classList.remove("placeholder");
    elements.repairPayload.textContent = pretty(payload);
    setStatus(elements.repairStatus, "good", "Repair payload ready. Give it back to your model, then validate again.");
    updateButtonState();
  } catch (error) {
    setStatus(elements.repairStatus, "bad", messageFor(error));
  }
}

async function generateWithLlm() {
  const contract = selectedContractName();
  const input = elements.llmSourceInput.value.trim();

  if (!contract) return setStatus(elements.llmOutputStatus, "bad", "Select a contract first.");
  if (!input) return setStatus(elements.llmOutputStatus, "bad", "Paste a natural-language input first.");

  const context = parseContextFromTextarea(elements.llmContextInput.value);
  if (!context.ok) return setStatus(elements.llmOutputStatus, "bad", context.error);

  clearLlmValidationState(false);
  setStatus(elements.llmOutputStatus, "info", `Calling ${selectedProvider()?.label ?? "provider"}…`);

  try {
    const result = await api("/api/llm/generate", {
      method: "POST",
      body: {
        ...selectedLlmRequestConfig(),
        contract,
        input,
        context: context.value
      }
    });

    renderLlmResult(result, "Generated JSON.");
  } catch (error) {
    setStatus(elements.llmOutputStatus, "bad", messageFor(error));
  }
}

async function validateLlmJson() {
  const contract = selectedContractName();
  if (!contract) return setStatus(elements.llmOutputStatus, "bad", "Select a contract first.");

  const parsed = parseJsonFromTextarea(elements.llmJsonOutput.value);
  if (!parsed.ok) {
    clearLlmValidationState(false);
    return setStatus(elements.llmOutputStatus, "bad", parsed.error);
  }

  setStatus(elements.llmOutputStatus, "info", "Calling validate_json…");

  try {
    const result = await validateContractJson(contract, parsed.value);
    state.lastLlmValidation = result;
    state.lastLlmResult = { validation: result, json: parsed.value };
    elements.llmPayload.classList.remove("placeholder");
    elements.llmPayload.textContent = pretty({ json: parsed.value, validation: result });
    renderValidationErrors(elements.llmValidationErrors, result.errors ?? []);
    setStatus(
      elements.llmOutputStatus,
      result.valid ? "good" : "bad",
      result.valid ? "Valid JSON. This object matches the contract." : "Invalid JSON. Click Repair with same provider."
    );
    updateButtonState();
  } catch (error) {
    setStatus(elements.llmOutputStatus, "bad", messageFor(error));
  }
}

async function repairWithLlm() {
  const contract = selectedContractName();
  if (!contract) return setStatus(elements.llmOutputStatus, "bad", "Select a contract first.");

  const parsed = parseJsonFromTextarea(elements.llmJsonOutput.value);
  if (!parsed.ok) return setStatus(elements.llmOutputStatus, "bad", parsed.error);

  const validationErrors = state.lastLlmValidation?.valid === false ? state.lastLlmValidation.errors : [];
  setStatus(elements.llmOutputStatus, "info", `Calling ${selectedProvider()?.label ?? "provider"} to repair…`);

  try {
    const result = await api("/api/llm/repair", {
      method: "POST",
      body: {
        ...selectedLlmRequestConfig(),
        contract,
        invalidJson: parsed.value,
        validationErrors
      }
    });

    renderLlmResult(result, "Repaired JSON.");
  } catch (error) {
    setStatus(elements.llmOutputStatus, "bad", messageFor(error));
  }
}

function renderLlmResult(result, successPrefix) {
  state.lastLlmResult = result;

  const display = {
    provider: result.provider,
    providerLabel: result.providerLabel,
    adapter: result.adapter,
    mode: result.mode,
    baseUrl: result.baseUrl,
    model: result.model,
    thinking: result.thinking,
    ...(result.reasoning ? { reasoning: result.reasoning } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    rawText: result.rawText,
    ...(result.json !== undefined ? { json: result.json } : {}),
    ...(result.parseError ? { parseError: result.parseError } : {}),
    validation: result.validation,
    ...(result.savedConfig ? { savedConfig: summarizeSavedConfig(result.savedConfig) } : {}),
    providerResponse: result.providerResponse
  };

  applySavedLlmConfig(result.savedConfig);

  elements.llmPayload.classList.remove("placeholder");
  elements.llmPayload.textContent = pretty(display);

  if (result.json !== undefined) {
    elements.llmJsonOutput.value = pretty(result.json);
    elements.jsonOutput.value = pretty(result.json);
  } else if (result.rawText) {
    elements.llmJsonOutput.value = result.rawText.trim();
  }

  if (!result.validation) {
    state.lastLlmValidation = null;
    renderValidationErrors(elements.llmValidationErrors, []);
    setStatus(elements.llmOutputStatus, "bad", result.parseError || "The model response was not parseable JSON.");
    updateButtonState();
    return;
  }

  state.lastLlmValidation = result.validation;
  renderValidationErrors(elements.llmValidationErrors, result.validation.errors ?? []);

  if (result.validation.valid) {
    setStatus(elements.llmOutputStatus, "good", `${successPrefix} It matches the contract.`);
  } else {
    setStatus(elements.llmOutputStatus, "bad", `${successPrefix} It does not validate yet. Use the repair button.`);
  }

  updateButtonState();
}

function summarizeSavedConfig(savedConfig) {
  if (!savedConfig || typeof savedConfig !== "object") return savedConfig;
  const { publicConfig, ...summary } = savedConfig;
  return summary;
}

function applySavedLlmConfig(savedConfig) {
  if (!savedConfig || typeof savedConfig !== "object") return;

  if (savedConfig.publicConfig) {
    const currentProvider = elements.llmProvider.value;
    const currentThinking = elements.llmThinking.value;
    state.llmConfig = savedConfig.publicConfig;
    state.providers = savedConfig.publicConfig.providers ?? [];
    renderProviderOptions({ preferredProvider: currentProvider });
    renderThinkingOptions(savedConfig.publicConfig.thinkingLevels ?? ["off", "low", "medium", "high", "xhigh", "auto"], {
      preferredThinking: currentThinking
    });
    updateLlmBaseUrlPlaceholder();
  }

  if (savedConfig.saved) {
    renderLlmConfigStatus();
    toast(`Saved LLM config to ${savedConfig.envPath}.`);
  } else if (savedConfig.error) {
    setStatus(elements.llmConfigStatus, "bad", `Could not save config: ${savedConfig.error}`);
  }
}

async function validateContractJson(contract, json) {
  return api("/api/validate", {
    method: "POST",
    body: { contract, json }
  });
}

function renderValidationErrors(element, errors) {
  element.innerHTML = "";

  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = `${error.path || "/"}: ${error.message} (${error.keyword})`;
    element.append(item);
  }
}

function clearContractPayloadState() {
  state.lastJsonContract = null;
  elements.jsonContractPayload.classList.add("placeholder");
  elements.jsonContractPayload.textContent = "The MCP-style get_json_contract payload will appear here.";
  hideStatus(elements.jsonContractStatus);
  updateButtonState();
}

function clearValidationState(resetPayload = true) {
  state.lastValidation = null;
  elements.validationErrors.innerHTML = "";
  hideStatus(elements.validationStatus);

  if (resetPayload) {
    elements.validationPayload.classList.add("placeholder");
    elements.validationPayload.textContent = "Validation results will appear here.";
  }

  updateButtonState();
}

function clearRepairState() {
  state.lastRepairContract = null;
  resetRepairPayload();
  hideStatus(elements.repairStatus);
  updateButtonState();
}

function resetRepairPayload() {
  state.lastRepairContract = null;
  elements.repairPayload.classList.add("placeholder");
  elements.repairPayload.textContent = "Repair payloads will appear here after a failed validation.";
  elements.copyRepair.disabled = true;
  updateButtonState();
}

function clearLlmValidationState(resetPayload = true) {
  state.lastLlmValidation = null;
  state.lastLlmResult = null;
  elements.llmValidationErrors.innerHTML = "";
  hideStatus(elements.llmOutputStatus);

  if (resetPayload) {
    elements.llmPayload.classList.add("placeholder");
    elements.llmPayload.textContent = "Provider result and validation details will appear here.";
  }

  updateButtonState();
}

function updateButtonState() {
  const hasContract = Boolean(state.currentContract);
  const hasFailedValidation = state.lastValidation?.valid === false;
  const hasFailedLlmValidation = state.lastLlmValidation?.valid === false;
  const provider = selectedProvider();
  const providerReady = Boolean(provider && (!provider.requiresApiKey || provider.hasApiKey || elements.llmApiKey.value.trim()));
  const hasProviderBaseUrl = Boolean(provider && (provider.defaultBaseUrl || elements.llmBaseUrl.value.trim()));
  const hasLlmModel = Boolean(elements.llmModel.value.trim());
  const hasLlmInput = Boolean(elements.llmSourceInput.value.trim());
  const hasLlmJson = Boolean(elements.llmJsonOutput.value.trim());

  elements.buildContract.disabled = !hasContract;
  elements.validateJson.disabled = !hasContract;
  elements.useExampleInput.disabled = !hasContract;
  elements.useExampleOutput.disabled = !hasContract;
  elements.useInvalidExample.disabled = !hasContract;
  elements.copyJsonContract.disabled = !state.lastJsonContract;
  elements.buildRepair.disabled = !hasFailedValidation;
  elements.copyRepair.disabled = !state.lastRepairContract;
  elements.llmUseExampleInput.disabled = !hasContract;
  elements.llmGenerate.disabled = !hasContract || !providerReady || !hasProviderBaseUrl || !hasLlmModel || !hasLlmInput;
  elements.llmValidate.disabled = !hasContract || !hasLlmJson;
  elements.llmRepair.disabled = !hasContract || !providerReady || !hasProviderBaseUrl || !hasLlmModel || !hasFailedLlmValidation;
  elements.llmCopyJson.disabled = !hasLlmJson;
}

function selectedContractName() {
  return elements.contractSelect.value || state.currentContract?.contract || "";
}

function selectedProvider() {
  return state.providers.find((provider) => provider.id === elements.llmProvider.value) ?? null;
}

function selectedLlmRequestConfig() {
  const provider = selectedProvider();
  return {
    provider: provider?.id ?? "",
    apiKey: elements.llmApiKey.value.trim(),
    baseUrl: elements.llmBaseUrl.value.trim(),
    model: elements.llmModel.value.trim(),
    thinking: elements.llmThinking.value || state.llmConfig?.defaultThinking || "medium",
    saveConfig: elements.llmSaveConfig.checked,
    saveAsDefault: elements.llmSaveAsDefault.checked
  };
}

function firstExample() {
  const examples = state.currentContract?.examples;
  return Array.isArray(examples) && examples.length > 0 ? examples[0] : null;
}

function makeInvalidExample() {
  const example = firstExample();
  const base = cloneJson(example?.output ?? {});

  if (base !== null && typeof base === "object" && !Array.isArray(base)) {
    return {
      ...base,
      __studio_extra_field: "This field should fail contracts with additionalProperties:false"
    };
  }

  return {
    value: base,
    __studio_extra_field: "This field should usually fail object schemas"
  };
}

function parseJsonFromTextarea(value) {
  const text = value.trim();
  if (!text) return { ok: false, error: "Paste JSON first." };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `Invalid JSON syntax: ${messageFor(error)}` };
  }
}

function parseContextFromTextarea(value) {
  const text = value.trim();
  if (!text) return { ok: true, value: {} };

  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Extra context must be a JSON object, not an array or primitive." };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `Invalid extra context JSON: ${messageFor(error)}` };
  }
}

function withStudioContext(context, studio) {
  return {
    ...context,
    _studio: {
      app: "prompt-to-json Studio",
      ...studio
    }
  };
}

async function api(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers ?? {}) };
  const init = { ...options, headers };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function setStatus(element, type, message) {
  element.className = `status ${type}`;
  element.textContent = message;
}

function hideStatus(element) {
  element.className = "status hidden";
  element.textContent = "";
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatInputValue(value) {
  return typeof value === "string" ? value : pretty(value);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast("Copy failed. Select the text and copy it manually.");
  }
}

let toastTimer;
function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}
