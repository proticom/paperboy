const MESSAGE_TYPES = {
  REQUEST_PAGE_DATA: "paperboy:request-page-data",
  EXTRACT_PAGE_DATA: "paperboy:extract-page-data",
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

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPES.REQUEST_PAGE_DATA) {
    return false;
  }

  (async () => {
    try {
      const activeTab = await getActiveTab();
      if (!activeTab?.id) {
        sendResponse({
          ok: false,
          error: "No active tab found. Open a normal web page and try again.",
        });
        return;
      }

      chrome.tabs.sendMessage(
        activeTab.id,
        { type: MESSAGE_TYPES.EXTRACT_PAGE_DATA },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              ok: false,
              error:
                "Could not read this tab. Some Chrome pages block extensions.",
            });
            return;
          }

          if (!response) {
            sendResponse({
              ok: false,
              error: "No response from content script.",
            });
            return;
          }

          sendResponse(response);
        },
      );
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message ?? "Failed to read current page.",
      });
    }
  })();

  // Keep this message channel open for async sendResponse.
  return true;
});
