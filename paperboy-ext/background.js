const MESSAGE_TYPES = {
  REQUEST_PAGE_DATA: "paperboy:request-page-data",
};

async function configureSidePanelBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error("Failed to configure side panel behavior:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior();
});

// Runs in the page context, no closure access. Returns a plain object.
function capturePageInPage() {
  return {
    html: document.documentElement?.outerHTML ?? "",
    title: document.title ?? "",
    url: window.location.href,
    lang: document.documentElement?.lang ?? "",
    capturedAt: new Date().toISOString(),
  };
}

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return {
      ok: false,
      error: "No active tab found. Open a normal web page and try again.",
    };
  }

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: capturePageInPage,
    });

    if (!injection?.result) {
      return { ok: false, error: "No content returned from this tab." };
    }

    return { ok: true, data: injection.result };
  } catch (error) {
    return {
      ok: false,
      error:
        error?.message ||
        "Could not read this tab. Some Chrome pages block extensions.",
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPES.REQUEST_PAGE_DATA) {
    return false;
  }

  captureActiveTab().then(sendResponse);
  // Keep the message channel open for async sendResponse.
  return true;
});
