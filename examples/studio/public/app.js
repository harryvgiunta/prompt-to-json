const elements = {
  studioShell: document.querySelector("#studioShell"),
  configSidebar: document.querySelector("#configSidebar"),
  toggleConfigSidebar: document.querySelector("#toggleConfigSidebar"),
  modeTabs: [...document.querySelectorAll(".tab-button")],
  operationTabs: document.querySelector("#operationTabs"),
  operationButtons: [...document.querySelectorAll(".operation-button")],
  stepCollapseButtons: [...document.querySelectorAll(".step-collapse-button")],
  contextToolboxButtons: [...document.querySelectorAll("[data-context-preset], [data-context-action]")],
  llmModePanel: document.querySelector("#llmModePanel"),
  llmJsonPanel: document.querySelector("#llmJsonPanel"),
  newContractPanel: document.querySelector("#newContractPanel"),
  contractPanel: document.querySelector("#contractPanel"),
  contractSelect: document.querySelector("#contractSelect"),
  contractsDirInput: document.querySelector("#contractsDirInput"),
  applyContractsDir: document.querySelector("#applyContractsDir"),
  contractsDirStatus: document.querySelector("#contractsDirStatus"),
  reloadContracts: document.querySelector("#reloadContracts"),
  contractDescription: document.querySelector("#contractDescription"),
  contractStatus: document.querySelector("#contractStatus"),
  rulesList: document.querySelector("#rulesList"),
  schemaPreview: document.querySelector("#schemaPreview"),
  examplesPreview: document.querySelector("#examplesPreview"),
  useExampleInput: document.querySelector("#useExampleInput"),
  useExampleOutput: document.querySelector("#useExampleOutput"),
  useInvalidExample: document.querySelector("#useInvalidExample"),
  llmProvider: document.querySelector("#llmProvider"),
  llmModel: document.querySelector("#llmModel"),
  llmThinking: document.querySelector("#llmThinking"),
  llmApiKey: document.querySelector("#llmApiKey"),
  llmBaseUrl: document.querySelector("#llmBaseUrl"),
  llmSaveConfig: document.querySelector("#llmSaveConfig"),
  llmSaveAsDefault: document.querySelector("#llmSaveAsDefault"),
  clearApiKey: document.querySelector("#clearApiKey"),
  llmConfigStatus: document.querySelector("#llmConfigStatus"),
  llmSourceInputLabel: document.querySelector("#llmSourceInputLabel"),
  llmSourceInput: document.querySelector("#llmSourceInput"),
  llmCurrentJsonInput: document.querySelector("#llmCurrentJsonInput"),
  llmEditFields: document.querySelector("#llmEditFields"),
  llmContextInput: document.querySelector("#llmContextInput"),
  llmGenerate: document.querySelector("#llmGenerate"),
  llmJsonOutput: document.querySelector("#llmJsonOutput"),
  llmValidate: document.querySelector("#llmValidate"),
  llmRepair: document.querySelector("#llmRepair"),
  llmCopyJson: document.querySelector("#llmCopyJson"),
  llmOutputStatus: document.querySelector("#llmOutputStatus"),
  llmValidationErrors: document.querySelector("#llmValidationErrors"),
  llmPayload: document.querySelector("#llmPayload"),
  newContractName: document.querySelector("#newContractName"),
  newContractFields: document.querySelector("#newContractFields"),
  newContractDescription: document.querySelector("#newContractDescription"),
  newContractExampleInput: document.querySelector("#newContractExampleInput"),
  newContractContext: document.querySelector("#newContractContext"),
  generateContractDraft: document.querySelector("#generateContractDraft"),
  contractDraftStatus: document.querySelector("#contractDraftStatus"),
  contractDraftJson: document.querySelector("#contractDraftJson"),
  validateContractDraft: document.querySelector("#validateContractDraft"),
  saveContractDraft: document.querySelector("#saveContractDraft"),
  overwriteContractDraft: document.querySelector("#overwriteContractDraft"),
  contractDraftValidation: document.querySelector("#contractDraftValidation"),
  toast: document.querySelector("#toast")
};

const state = {
  mode: "llm",
  operation: "create",
  contracts: [],
  currentContract: null,
  llmConfig: null,
  providers: [],
  configSidebarOpen: true,
  lastLlmValidation: null,
  lastLlmResult: null,
  lastContractDraftValidation: null
};

const progressTimers = new WeakMap();

restoreConfigSidebarState();
wireEvents();
await loadLlmProviders();
await loadContractsDirConfig();
await loadContracts();

function wireEvents() {
  elements.toggleConfigSidebar.addEventListener("click", () => {
    state.configSidebarOpen = !state.configSidebarOpen;
    saveConfigSidebarPreference();
    applyConfigSidebarState();
  });

  for (const button of elements.stepCollapseButtons) {
    button.addEventListener("click", () => toggleStepPanel(button));
  }
  initializeStepCollapseState();

  for (const button of elements.contextToolboxButtons) {
    button.addEventListener("click", () => handleContextToolboxButton(button));
  }

  for (const tab of elements.modeTabs) {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
  }

  for (const button of elements.operationButtons) {
    button.addEventListener("click", () => switchOperation(button.dataset.operation));
  }

  elements.reloadContracts.addEventListener("click", async () => {
    await reloadContracts();
  });

  elements.applyContractsDir.addEventListener("click", async () => {
    await applyContractsDir();
  });

  elements.contractSelect.addEventListener("change", async () => {
    await loadContractDetails(elements.contractSelect.value, { clearWorkspace: true });
  });

  elements.useExampleInput.addEventListener("click", () => {
    const example = state.operation === "edit" ? firstEditExample() : firstExample();
    if (!example || example.input === undefined) return toast("No example input for this contract.");

    const text = formatInputValue(example.input);
    elements.llmSourceInput.value = text;

    if (state.operation === "edit" && example.currentJson !== undefined) {
      elements.llmCurrentJsonInput.value = pretty(example.currentJson);
    }

    clearLlmValidationState();
    updateButtonState();
  });

  elements.useExampleOutput.addEventListener("click", () => {
    const example = state.operation === "edit" ? firstEditExample() ?? firstExample() : firstExample();
    const value = example?.output ?? example?.currentJson;
    if (value === undefined) return toast("No example JSON for this contract.");

    const json = pretty(value);
    elements.llmJsonOutput.value = json;
    elements.llmCurrentJsonInput.value = json;
    clearLlmValidationState();
  });

  elements.useInvalidExample.addEventListener("click", () => {
    const json = pretty(makeInvalidExample());
    elements.llmJsonOutput.value = json;
    elements.llmCurrentJsonInput.value = json;
    clearLlmValidationState();
    toast("Inserted an intentionally invalid JSON sample.");
  });

  elements.llmProvider.addEventListener("change", () => {
    applySelectedProviderDefaults();
    renderLlmConfigStatus();
    updateButtonState();
    scheduleSaveCurrentLlmConfig();
  });

  for (const input of [elements.llmModel, elements.llmThinking, elements.llmApiKey, elements.llmBaseUrl]) {
    input.addEventListener("input", () => {
      renderLlmConfigStatus();
      updateButtonState();
      scheduleSaveCurrentLlmConfig();
    });
  }

  for (const input of [
    elements.llmSourceInput,
    elements.llmCurrentJsonInput,
    elements.llmContextInput,
    elements.newContractName,
    elements.newContractFields,
    elements.newContractDescription,
    elements.newContractExampleInput,
    elements.newContractContext
  ]) {
    input.addEventListener("input", () => {
      renderLlmConfigStatus();
      updateButtonState();
    });
  }

  elements.llmJsonOutput.addEventListener("input", () => {
    state.lastLlmValidation = null;
    state.lastLlmResult = null;
    elements.llmValidationErrors.innerHTML = "";
    hideStatus(elements.llmOutputStatus);
    updateButtonState();
  });

  elements.contractDraftJson.addEventListener("input", () => {
    state.lastContractDraftValidation = null;
    updateButtonState();
  });

  elements.llmSaveConfig.addEventListener("change", () => {
    if (!elements.llmSaveConfig.checked) elements.llmSaveAsDefault.checked = false;
    renderLlmConfigStatus();
    updateButtonState();
    if (elements.llmSaveConfig.checked) void saveCurrentLlmConfig();
  });

  elements.llmSaveAsDefault.addEventListener("change", () => {
    if (elements.llmSaveAsDefault.checked) elements.llmSaveConfig.checked = true;
    renderLlmConfigStatus();
    updateButtonState();
    if (elements.llmSaveConfig.checked) void saveCurrentLlmConfig();
  });

  elements.clearApiKey.addEventListener("click", () => {
    elements.llmApiKey.value = "";
    renderLlmConfigStatus();
    updateButtonState();
    toast("Cleared API key from this browser session.");
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

  elements.generateContractDraft.addEventListener("click", async () => {
    await generateContractDraft();
  });

  elements.validateContractDraft.addEventListener("click", async () => {
    await validateContractDraft();
  });

  elements.saveContractDraft.addEventListener("click", async () => {
    await saveContractDraft();
  });
}

function restoreConfigSidebarState() {
  try {
    state.configSidebarOpen = localStorage.getItem("prompt-to-json.studio.configSidebarOpen") !== "false";
  } catch {
    state.configSidebarOpen = true;
  }

  applyConfigSidebarState();
}

function saveConfigSidebarPreference() {
  try {
    localStorage.setItem("prompt-to-json.studio.configSidebarOpen", String(state.configSidebarOpen));
  } catch {
    // Ignore storage errors; the toggle should still work for this session.
  }
}

function applyConfigSidebarState() {
  const isOpen = state.configSidebarOpen;
  document.body.classList.toggle("config-sidebar-collapsed", !isOpen);
  elements.studioShell.classList.toggle("sidebar-collapsed", !isOpen);
  elements.configSidebar.classList.toggle("closed", !isOpen);
  elements.toggleConfigSidebar.textContent = isOpen ? "‹" : "›";
  elements.toggleConfigSidebar.setAttribute("aria-expanded", String(isOpen));
  elements.toggleConfigSidebar.setAttribute("aria-label", isOpen ? "Hide configuration" : "Show configuration");
  elements.toggleConfigSidebar.title = isOpen ? "Hide configuration" : "Show configuration";
}

function initializeStepCollapseState() {
  for (const button of elements.stepCollapseButtons) {
    const panel = button.closest(".collapsible-step");
    if (!panel) continue;

    let collapsed = false;
    try {
      collapsed = localStorage.getItem(stepPanelStorageKey(panel)) === "true";
    } catch {
      collapsed = false;
    }

    setStepCollapsed(panel, collapsed, { save: false });
  }
}

function toggleStepPanel(button) {
  const panel = button.closest(".collapsible-step");
  if (!panel) return;
  setStepCollapsed(panel, !panel.classList.contains("collapsed"));
}

function setStepCollapsed(panel, collapsed, options = {}) {
  panel.classList.toggle("collapsed", collapsed);

  const button = panel.querySelector(".step-collapse-button");
  const action = button?.querySelector(".collapse-action");
  const icon = button?.querySelector(".collapse-icon");

  if (button) {
    button.setAttribute("aria-expanded", String(!collapsed));
    button.title = collapsed ? "Expand this step" : "Collapse this step";
    button.setAttribute("aria-label", collapsed ? "Expand this step" : "Collapse this step");
  }
  if (action) action.textContent = collapsed ? "Expand" : "Collapse";
  if (icon) icon.textContent = collapsed ? "+" : "−";

  if (options.save !== false) {
    try {
      localStorage.setItem(stepPanelStorageKey(panel), String(collapsed));
    } catch {
      // Ignore storage errors; the step still collapses for this session.
    }
  }
}

function stepPanelStorageKey(panel) {
  return `prompt-to-json.studio.${panel.dataset.collapseId || "step"}.collapsed`;
}

function handleContextToolboxButton(button) {
  const toolbox = button.closest(".context-toolbox");
  const targetId = toolbox?.dataset.contextTarget;
  const textarea = targetId ? document.getElementById(targetId) : null;
  if (!textarea) return;

  if (button.dataset.contextPreset) {
    addContextPreset(textarea, button.dataset.contextPreset, button.textContent.replace(/^\+\s*/, "").trim());
    return;
  }

  if (button.dataset.contextAction === "pretty") {
    prettyFormatContext(textarea);
    return;
  }

  if (button.dataset.contextAction === "clear") {
    textarea.value = "";
    notifyContextChanged(textarea);
    toast("Cleared context JSON.");
  }
}

function addContextPreset(textarea, presetId, label) {
  const existing = parseContextFromTextarea(textarea.value);
  if (!existing.ok) return toast(existing.error);

  const preset = buildContextPreset(presetId);
  if (!preset) return toast("Unknown context preset.");

  textarea.value = pretty({
    ...existing.value,
    ...preset
  });
  notifyContextChanged(textarea);
  toast(`Added ${label} context.`);
}

function prettyFormatContext(textarea) {
  if (!textarea.value.trim()) return toast("No context JSON to format.");

  const parsed = parseContextFromTextarea(textarea.value);
  if (!parsed.ok) return toast(parsed.error);

  textarea.value = pretty(parsed.value);
  notifyContextChanged(textarea);
  toast("Formatted context JSON.");
}

function buildContextPreset(presetId) {
  const now = new Date();
  const iso = now.toISOString();
  const locale = navigator.language || "en-US";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  switch (presetId) {
    case "current-datetime":
      return {
        current_datetime: iso,
        current_date: iso.slice(0, 10),
        timezone,
        locale
      };
    case "created-at":
      return { created_at: iso };
    case "updated-at":
      return { updated_at: iso };
    case "unique-id":
      return { unique_id: randomUuid() };
    case "user":
      return {
        user: {
          id: "user_123",
          email: "user@example.com",
          name: "Jane Doe",
          role: "member"
        }
      };
    case "session":
      return {
        session: {
          id: shortContextId("session"),
          source: "web",
          locale,
          timezone
        }
      };
    case "workspace":
      return {
        workspace: {
          id: "workspace_123",
          name: "Demo Workspace"
        }
      };
    default:
      return null;
  }
}

function notifyContextChanged(textarea) {
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function shortContextId(prefix) {
  return `${prefix}_${randomUuid().replace(/-/g, "").slice(0, 16)}`;
}

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function switchMode(mode) {
  if (!mode || mode === state.mode) return;
  state.mode = mode;

  for (const tab of elements.modeTabs) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  }

  const isContractMode = mode === "contract";
  elements.contractPanel.classList.toggle("hidden", isContractMode);
  elements.llmModePanel.classList.toggle("hidden", isContractMode);
  elements.newContractPanel.classList.toggle("hidden", !isContractMode);
  elements.operationTabs.classList.toggle("hidden", isContractMode);

  updateButtonState();
}

function switchOperation(operation) {
  if (!operation || operation === state.operation) return;
  state.operation = operation;

  if (operation === "edit") {
    const editExample = firstEditExample();
    if (editExample?.currentJson !== undefined && !elements.llmCurrentJsonInput.value.trim()) {
      elements.llmCurrentJsonInput.value = pretty(editExample.currentJson);
    }
    if (editExample?.input !== undefined && !elements.llmSourceInput.value.trim()) {
      elements.llmSourceInput.value = formatInputValue(editExample.input);
    }
  }

  clearLlmValidationState();
  updateOperationUi();
  updateButtonState();
}

function updateOperationUi() {
  if (state.operation === "edit" && !editOperationEnabled()) {
    state.operation = "create";
  }

  const isEdit = state.operation === "edit";

  for (const button of elements.operationButtons) {
    button.classList.toggle("active", button.dataset.operation === state.operation);
    button.disabled = button.dataset.operation === "edit" && !editOperationEnabled();
  }

  elements.llmEditFields.classList.toggle("hidden", !isEdit);
  elements.llmSourceInputLabel.textContent = isEdit ? "Requested change" : "Input to convert";
  elements.llmSourceInput.placeholder = isEdit ? "Example: we want the last 20 closed tickets" : "Example: Urgent, users cannot log in after SSO update.";
  elements.llmCurrentJsonInput.placeholder = '{"status":"open","limit":50}';
  elements.llmGenerate.textContent = isEdit ? "Generate edited JSON" : "Generate JSON";
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

async function loadContractsDirConfig() {
  try {
    const config = await api("/api/contracts-dir");
    elements.contractsDirInput.value = config.contractsDir ?? "";
    setStatus(elements.contractsDirStatus, "info", `Using ${config.contractsDir}. Loaded contracts: ${(config.contracts ?? []).length}.`);
  } catch (error) {
    setStatus(elements.contractsDirStatus, "bad", messageFor(error));
  }
}

async function applyContractsDir() {
  const contractsDir = elements.contractsDirInput.value.trim();
  if (!contractsDir) return setStatus(elements.contractsDirStatus, "bad", "Enter a contract repository folder.");

  setStatus(elements.contractsDirStatus, "info", "Switching contract repository…");

  try {
    const result = await api("/api/contracts-dir", {
      method: "POST",
      body: { contractsDir }
    });
    elements.contractsDirInput.value = result.contractsDir ?? contractsDir;
    setStatus(elements.contractsDirStatus, "good", `Using ${result.contractsDir}. Loaded ${result.loaded ?? 0} contract(s).`);
    clearWorkspaceFields();
    await loadContracts({ forceExampleValues: false });
    toast("Contract repository switched.");
  } catch (error) {
    setStatus(elements.contractsDirStatus, "bad", messageFor(error));
  }
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
      ? "Base URL: provider default."
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
  setStatus(elements.contractStatus, "info", "Loading contracts…");

  try {
    const result = await api("/api/contracts");
    state.contracts = result.contracts ?? [];
    renderContractOptions();

    if (state.contracts.length === 0) {
      state.currentContract = null;
      elements.contractDescription.textContent = "No contracts loaded. Add .json files to the configured repository and click Reload.";
      setStatus(elements.contractStatus, "bad", "No contracts are available.");
      updateButtonState();
      return;
    }

    const selected = elements.contractSelect.value || state.contracts[0].name;
    await loadContractDetails(selected, { forceExampleValues });
    hideStatus(elements.contractStatus);
  } catch (error) {
    setStatus(elements.contractStatus, "bad", messageFor(error));
  }
}

async function reloadContracts() {
  setStatus(elements.contractStatus, "info", "Reloading contracts from disk…");

  try {
    await api("/api/reload", { method: "POST", body: {} });
    await loadContracts({ forceExampleValues: true });
    toast("Contracts reloaded. Example fields refreshed.");
  } catch (error) {
    setStatus(elements.contractStatus, "bad", messageFor(error));
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
  const { forceExampleValues = false, clearWorkspace = false } = options;
  if (!contractName) return;

  try {
    const contract = await api(`/api/contracts/${encodeURIComponent(contractName)}`);
    state.currentContract = contract;
    elements.contractSelect.value = contract.contract;
    if (clearWorkspace) clearWorkspaceFields();
    renderContractDetails(contract, {
      forceExampleValues,
      prefillExamples: !clearWorkspace
    });
    clearLlmValidationState();
  } catch (error) {
    elements.contractDescription.textContent = messageFor(error);
    updateButtonState();
  }
}

function renderContractDetails(contract, options = {}) {
  const { forceExampleValues = false, prefillExamples = true } = options;
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
  elements.examplesPreview.textContent = pretty({
    create: contract.examples ?? [],
    edit: contract.operations?.edit?.examples ?? []
  });

  if (prefillExamples) {
    const example = firstExample();
    if (example?.input !== undefined) {
      const text = formatInputValue(example.input);
      if (forceExampleValues || !elements.llmSourceInput.value.trim()) elements.llmSourceInput.value = text;
    }

    if (example?.output !== undefined) {
      const json = pretty(example.output);
      if (forceExampleValues || !elements.llmCurrentJsonInput.value.trim()) elements.llmCurrentJsonInput.value = json;
    }

    const editExample = firstEditExample();
    if (editExample?.currentJson !== undefined) {
      const json = pretty(editExample.currentJson);
      if (forceExampleValues || !elements.llmCurrentJsonInput.value.trim()) elements.llmCurrentJsonInput.value = json;
    }
    if (editExample?.input !== undefined && state.operation === "edit") {
      const text = formatInputValue(editExample.input);
      if (forceExampleValues || !elements.llmSourceInput.value.trim()) elements.llmSourceInput.value = text;
    }
  }

  updateOperationUi();
  updateButtonState();
}

async function generateWithLlm() {
  const contract = selectedContractName();
  const input = elements.llmSourceInput.value.trim();

  if (!contract) return setStatus(elements.llmOutputStatus, "bad", "Select a contract first.");
  if (!input) return setStatus(elements.llmOutputStatus, "bad", state.operation === "edit" ? "Describe the requested change first." : "Paste a natural-language input first.");

  const context = parseContextFromTextarea(elements.llmContextInput.value);
  if (!context.ok) return setStatus(elements.llmOutputStatus, "bad", context.error);

  const body = {
    ...selectedLlmRequestConfig(),
    contract,
    input,
    context: context.value
  };
  let endpoint = "/api/llm/generate";
  let successPrefix = "Generated JSON.";

  if (state.operation === "edit") {
    const currentJson = parseJsonFromTextarea(elements.llmCurrentJsonInput.value);
    if (!currentJson.ok) return setStatus(elements.llmOutputStatus, "bad", `Existing JSON: ${currentJson.error}`);
    body.currentJson = currentJson.value;
    endpoint = "/api/llm/edit";
    successPrefix = "Edited JSON.";
  }

  clearLlmValidationState(false);
  const stopProgress = startTimedStatus(elements.llmOutputStatus, `Calling ${selectedProvider()?.label ?? "provider"}`);

  try {
    const result = await api(endpoint, {
      method: "POST",
      body
    });

    const elapsedSeconds = stopProgress();
    renderLlmResult(result, withElapsedSeconds(successPrefix, elapsedSeconds));
  } catch (error) {
    stopProgress();
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
  const stopProgress = startTimedStatus(elements.llmOutputStatus, `Calling ${selectedProvider()?.label ?? "provider"} to repair`);

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

    const elapsedSeconds = stopProgress();
    renderLlmResult(result, withElapsedSeconds("Repaired JSON.", elapsedSeconds));
  } catch (error) {
    stopProgress();
    setStatus(elements.llmOutputStatus, "bad", messageFor(error));
  }
}

async function generateContractDraft() {
  const description = elements.newContractDescription.value.trim();
  if (!description) return setStatus(elements.contractDraftStatus, "bad", "Describe the app behavior first.");

  const context = parseContextFromTextarea(elements.newContractContext.value);
  if (!context.ok) return setStatus(elements.contractDraftStatus, "bad", context.error);

  const provider = selectedProvider();
  if (!provider) return setStatus(elements.contractDraftStatus, "bad", "Choose an LLM provider first.");

  const stopProgress = startTimedStatus(elements.contractDraftStatus, `Generating contract with ${provider.label}`);
  state.lastContractDraftValidation = null;
  elements.contractDraftValidation.classList.add("placeholder");
  elements.contractDraftValidation.textContent = "Draft validation and save results will appear here.";

  try {
    const result = await api("/api/contract-drafts/generate", {
      method: "POST",
      body: {
        ...selectedLlmRequestConfig(),
        suggestedName: elements.newContractName.value.trim(),
        description,
        desiredFields: elements.newContractFields.value,
        exampleInputs: elements.newContractExampleInput.value,
        context: context.value
      }
    });

    const elapsedSeconds = stopProgress();
    if (result.draft) {
      elements.contractDraftJson.value = pretty(result.draft);
      if (result.draft.contractName) elements.newContractName.value = result.draft.contractName;
    } else if (result.rawText) {
      elements.contractDraftJson.value = result.rawText.trim();
    }

    state.lastContractDraftValidation = result.validation ?? null;
    renderContractDraftValidation({
      ...result,
      elapsedSeconds
    });

    setStatus(
      elements.contractDraftStatus,
      result.validation?.valid ? "good" : "bad",
      result.validation?.valid
        ? withElapsedSeconds("Contract draft generated and validated.", elapsedSeconds)
        : withElapsedSeconds("Contract draft generated but needs review.", elapsedSeconds)
    );
    updateButtonState();
  } catch (error) {
    stopProgress();
    setStatus(elements.contractDraftStatus, "bad", messageFor(error));
  }
}

async function validateContractDraft() {
  const parsed = parseJsonFromTextarea(elements.contractDraftJson.value);
  if (!parsed.ok) return setStatus(elements.contractDraftStatus, "bad", parsed.error);

  setStatus(elements.contractDraftStatus, "info", "Validating draft…");

  try {
    const result = await api("/api/contract-drafts/validate", {
      method: "POST",
      body: parsed.value
    });

    state.lastContractDraftValidation = result.validation;
    renderContractDraftValidation(result);
    setStatus(
      elements.contractDraftStatus,
      result.validation.valid ? "good" : "bad",
      result.validation.valid ? "Contract draft is valid and ready to save." : "Contract draft is invalid. Review validation details."
    );
    updateButtonState();
  } catch (error) {
    setStatus(elements.contractDraftStatus, "bad", messageFor(error));
  }
}

async function saveContractDraft() {
  const parsed = parseJsonFromTextarea(elements.contractDraftJson.value);
  if (!parsed.ok) return setStatus(elements.contractDraftStatus, "bad", parsed.error);

  setStatus(elements.contractDraftStatus, "info", "Saving contract…");

  try {
    const result = await api("/api/contract-drafts/save", {
      method: "POST",
      body: {
        ...parsed.value,
        overwrite: elements.overwriteContractDraft.checked
      }
    });

    renderContractDraftValidation(result);
    setStatus(elements.contractDraftStatus, "good", `Saved ${result.path}. Contracts reloaded.`);
    toast(`Saved contract: ${result.contractName}`);

    await loadContracts({ forceExampleValues: false });
    elements.contractSelect.value = result.contractName;
    await loadContractDetails(result.contractName, { clearWorkspace: true });
    switchMode("llm");
  } catch (error) {
    setStatus(elements.contractDraftStatus, "bad", messageFor(error));
  }
}

function renderContractDraftValidation(result) {
  const display = {
    ...(result.draft ? { draft: result.draft } : {}),
    ...(result.saved !== undefined ? { saved: result.saved, contractName: result.contractName, path: result.path } : {}),
    validation: result.validation,
    ...(result.parseError ? { parseError: result.parseError } : {}),
    ...(result.provider ? { provider: result.provider, model: result.model, thinking: result.thinking } : {}),
    ...(result.elapsedSeconds ? { elapsedSeconds: result.elapsedSeconds } : {})
  };

  elements.contractDraftValidation.classList.remove("placeholder");
  elements.contractDraftValidation.textContent = pretty(display);
}

function renderLlmResult(result, successPrefix) {
  state.lastLlmResult = result;

  const editDiff = result.mode === "edit" && result.json !== undefined && result.editContract?.currentJson !== undefined
    ? diffJson(result.editContract.currentJson, result.json)
    : [];
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
    ...(editDiff.length ? { editDiff } : {}),
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

let saveConfigTimer;
function scheduleSaveCurrentLlmConfig() {
  if (!elements.llmSaveConfig.checked) return;
  clearTimeout(saveConfigTimer);
  saveConfigTimer = setTimeout(() => {
    void saveCurrentLlmConfig({ quiet: true });
  }, 500);
}

async function saveCurrentLlmConfig(options = {}) {
  if (!elements.llmSaveConfig.checked) return;
  const { quiet = false } = options;

  if (!quiet) {
    setStatus(elements.llmConfigStatus, "info", "Saving LLM config to local .env…");
  }

  try {
    const savedConfig = await api("/api/llm/save-config", {
      method: "POST",
      body: selectedLlmRequestConfig()
    });
    applySavedLlmConfig(savedConfig);
  } catch (error) {
    setStatus(elements.llmConfigStatus, "bad", `Could not save config: ${messageFor(error)}`);
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

function clearLlmValidationState(resetPayload = true) {
  state.lastLlmValidation = null;
  state.lastLlmResult = null;
  elements.llmValidationErrors.innerHTML = "";
  hideStatus(elements.llmOutputStatus);

  if (resetPayload) {
    elements.llmPayload.classList.add("placeholder");
    elements.llmPayload.textContent = "Provider result, validation details, and edit diff when applicable will appear here.";
  }

  updateButtonState();
}

function clearWorkspaceFields() {
  elements.llmSourceInput.value = "";
  elements.llmCurrentJsonInput.value = "";
  elements.llmContextInput.value = "";
  elements.llmJsonOutput.value = "";
  clearLlmValidationState();
}

function updateButtonState() {
  const hasContract = Boolean(state.currentContract);
  const isEdit = state.operation === "edit";
  const canUseOperation = !isEdit || editOperationEnabled();
  const hasLlmCurrentJson = !isEdit || Boolean(elements.llmCurrentJsonInput.value.trim());
  const hasFailedLlmValidation = state.lastLlmValidation?.valid === false;
  const provider = selectedProvider();
  const providerReady = Boolean(provider && (!provider.requiresApiKey || provider.hasApiKey || elements.llmApiKey.value.trim()));
  const hasProviderBaseUrl = Boolean(provider && (provider.defaultBaseUrl || elements.llmBaseUrl.value.trim()));
  const hasLlmModel = Boolean(elements.llmModel.value.trim());
  const hasLlmInput = Boolean(elements.llmSourceInput.value.trim());
  const hasLlmJson = Boolean(elements.llmJsonOutput.value.trim());
  const hasContractDraftDescription = Boolean(elements.newContractDescription.value.trim());
  const hasContractDraft = Boolean(elements.contractDraftJson.value.trim());

  elements.useExampleInput.disabled = !hasContract;
  elements.useExampleOutput.disabled = !hasContract;
  elements.useInvalidExample.disabled = !hasContract;
  elements.llmGenerate.disabled = !hasContract || !canUseOperation || !providerReady || !hasProviderBaseUrl || !hasLlmModel || !hasLlmInput || !hasLlmCurrentJson;
  elements.llmValidate.disabled = !hasContract || !hasLlmJson;
  elements.llmRepair.disabled = !hasContract || !providerReady || !hasProviderBaseUrl || !hasLlmModel || !hasFailedLlmValidation;
  elements.llmCopyJson.disabled = !hasLlmJson;
  elements.generateContractDraft.disabled = !providerReady || !hasProviderBaseUrl || !hasLlmModel || !hasContractDraftDescription;
  elements.validateContractDraft.disabled = !hasContractDraft;
  elements.saveContractDraft.disabled = !hasContractDraft || state.lastContractDraftValidation?.valid !== true;
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

function firstEditExample() {
  const examples = state.currentContract?.operations?.edit?.examples;
  return Array.isArray(examples) && examples.length > 0 ? examples[0] : null;
}

function editOperationEnabled() {
  return state.currentContract?.operations?.edit?.enabled !== false;
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
    return { ok: false, error: `Invalid app context JSON: ${messageFor(error)}` };
  }
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
  stopTimedStatus(element);
  element.className = `status ${type}`;
  element.textContent = message;
}

function startTimedStatus(element, message) {
  stopTimedStatus(element);
  const startedAt = Date.now();

  const render = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const dots = ".".repeat((elapsed % 3) + 1);
    element.className = "status info running";
    element.textContent = `${message}${dots} ${elapsed}s`;
  };

  render();
  const timer = setInterval(render, 250);
  progressTimers.set(element, { timer, startedAt });

  return () => stopTimedStatus(element);
}

function stopTimedStatus(element) {
  const progress = progressTimers.get(element);
  if (!progress) return 0;
  clearInterval(progress.timer);
  progressTimers.delete(element);
  return Math.max(0.1, (Date.now() - progress.startedAt) / 1000);
}

function withElapsedSeconds(message, seconds) {
  const rounded = seconds < 10 ? seconds.toFixed(1) : String(Math.round(seconds));
  return `${message} (${rounded}s)`;
}

function hideStatus(element) {
  stopTimedStatus(element);
  element.className = "status hidden";
  element.textContent = "";
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function diffJson(before, after, path = "") {
  if (Object.is(before, after)) return [];

  const beforeIsObject = isPlainObject(before);
  const afterIsObject = isPlainObject(after);
  if (beforeIsObject && afterIsObject) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) => {
      const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
      if (!Object.prototype.hasOwnProperty.call(before, key)) {
        return [{ op: "add", path: childPath, value: after[key] }];
      }
      if (!Object.prototype.hasOwnProperty.call(after, key)) {
        return [{ op: "remove", path: childPath, from: before[key] }];
      }
      return diffJson(before[key], after[key], childPath);
    });
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const max = Math.max(before.length, after.length);
    return Array.from({ length: max }, (_value, index) => {
      const childPath = `${path}/${index}`;
      if (index >= before.length) return [{ op: "add", path: childPath, value: after[index] }];
      if (index >= after.length) return [{ op: "remove", path: childPath, from: before[index] }];
      return diffJson(before[index], after[index], childPath);
    }).flat();
  }

  return [{ op: "replace", path: path || "/", from: before, value: after }];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeJsonPointerSegment(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
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
