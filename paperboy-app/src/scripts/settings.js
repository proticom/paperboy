// Settings dialog: provider selection + OS-keychain-backed API keys.
//
// Keys are stored via four Rust Tauri commands (get_api_key, set_api_key,
// delete_api_key, list_configured_providers) backed by the `keyring`
// crate. Service name is "paperboy-cli" so keys set by the CLI are
// readable in the app and vice versa.

const PROVIDERS = {
  disabled: { label: "Disabled (deterministic only)", needsKey: false, hasEndpoint: false },
  openrouter: {
    label: "OpenRouter",
    needsKey: true,
    hasEndpoint: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-5-mini",
    signupUrl: "https://openrouter.ai/keys",
  },
  openai: {
    label: "OpenAI",
    needsKey: true,
    hasEndpoint: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    signupUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic",
    needsKey: true,
    hasEndpoint: false,
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5-20251001",
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  xai: {
    label: "xAI / Grok",
    needsKey: true,
    hasEndpoint: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-vision",
    signupUrl: "https://console.x.ai/",
  },
  ollama: {
    label: "Ollama (local)",
    needsKey: false,
    hasEndpoint: true,
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.2:3b",
  },
  "local-endpoint": {
    label: "Local OpenAI-compatible endpoint",
    needsKey: false,
    hasEndpoint: true,
    defaultBaseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
  },
};

const SETTINGS_KEY = "paperboy-app-ai-settings";

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { provider: "disabled", baseUrl: "", model: "" };
    return JSON.parse(raw);
  } catch {
    return { provider: "disabled", baseUrl: "", model: "" };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function initSettings({ invoke }) {
  const dialog = document.querySelector("[data-settings-dialog]");
  if (!dialog) return { open() {} };

  const providerSelect = dialog.querySelector("[data-settings-provider]");
  const keySection = dialog.querySelector("[data-settings-key-section]");
  const keyInput = dialog.querySelector("[data-settings-key]");
  const keyStatus = dialog.querySelector("[data-settings-key-status]");
  const keySaveBtn = dialog.querySelector("[data-settings-key-save]");
  const keyClearBtn = dialog.querySelector("[data-settings-key-clear]");
  const signupHelp = dialog.querySelector("[data-settings-signup]");
  const signupLink = dialog.querySelector("[data-settings-signup-link]");
  const endpointSection = dialog.querySelector("[data-settings-endpoint-section]");
  const baseUrlInput = dialog.querySelector("[data-settings-base-url]");
  const modelInput = dialog.querySelector("[data-settings-model]");
  const statusEl = dialog.querySelector("[data-settings-status]");
  const closeBtn = dialog.querySelector("[data-settings-close]");
  const doneBtn = dialog.querySelector("[data-settings-done]");

  let settings = loadSettings();

  function setStatus(message, kind = "info") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
    if (message) {
      setTimeout(() => {
        if (statusEl.textContent === message) {
          statusEl.textContent = "";
          delete statusEl.dataset.kind;
        }
      }, 2500);
    }
  }

  async function refreshKeyStatus() {
    const provider = settings.provider;
    const info = PROVIDERS[provider];
    if (!info?.needsKey || !invoke) {
      keyStatus.textContent = "";
      return;
    }
    try {
      const existing = await invoke("get_api_key", { provider });
      if (existing) {
        keyStatus.textContent = "Stored in keychain";
        keyStatus.dataset.state = "stored";
      } else {
        keyStatus.textContent = "Not set";
        keyStatus.dataset.state = "unset";
      }
    } catch (err) {
      keyStatus.textContent = `Error: ${err}`;
      keyStatus.dataset.state = "error";
    }
  }

  function renderProviderUi() {
    const provider = settings.provider;
    const info = PROVIDERS[provider];
    if (!info) return;

    keySection.hidden = !info.needsKey;
    endpointSection.hidden = !info.hasEndpoint && !info.needsKey;

    if (info.signupUrl) {
      signupLink.href = info.signupUrl;
      signupLink.textContent = info.signupUrl.replace(/^https?:\/\//, "");
      signupHelp.hidden = false;
    } else {
      signupHelp.hidden = true;
    }

    // Pre-fill base URL + model with current settings or defaults so the
    // user sees a sensible value the first time they open this provider.
    baseUrlInput.value = settings.baseUrl || info.defaultBaseUrl || "";
    modelInput.value = settings.model || info.defaultModel || "";
    keyInput.value = "";
    refreshKeyStatus();
  }

  providerSelect.addEventListener("change", () => {
    settings = { ...settings, provider: providerSelect.value, baseUrl: "", model: "" };
    saveSettings(settings);
    renderProviderUi();
  });

  baseUrlInput.addEventListener("change", () => {
    settings = { ...settings, baseUrl: baseUrlInput.value.trim() };
    saveSettings(settings);
  });

  modelInput.addEventListener("change", () => {
    settings = { ...settings, model: modelInput.value.trim() };
    saveSettings(settings);
  });

  keySaveBtn.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) {
      setStatus("Enter a key first.", "error");
      return;
    }
    try {
      await invoke("set_api_key", { provider: settings.provider, key });
      setStatus("Saved to OS keychain.", "success");
      keyInput.value = "";
      refreshKeyStatus();
    } catch (err) {
      setStatus(`Could not save: ${err}`, "error");
    }
  });

  keyClearBtn.addEventListener("click", async () => {
    try {
      await invoke("delete_api_key", { provider: settings.provider });
      setStatus("Removed from OS keychain.", "success");
      keyInput.value = "";
      refreshKeyStatus();
    } catch (err) {
      setStatus(`Could not remove: ${err}`, "error");
    }
  });

  closeBtn.addEventListener("click", () => dialog.close());
  doneBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    // Clicking the backdrop (the <dialog> itself, not its form contents)
    // closes the dialog. Cheaper than wiring an overlay element.
    if (event.target === dialog) dialog.close();
  });

  return {
    open() {
      settings = loadSettings();
      providerSelect.value = settings.provider;
      renderProviderUi();
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.show();
        }
      }
    },
  };
}
