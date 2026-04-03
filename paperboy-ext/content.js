const MESSAGE_TYPES = {
  EXTRACT_PAGE_DATA: "paperboy:extract-page-data",
};

function extractPageData() {
  const html = document.documentElement?.outerHTML ?? "";
  const title = document.title ?? "";
  const url = window.location.href;
  const lang = document.documentElement?.lang ?? "";

  return {
    ok: true,
    data: {
      html,
      title,
      url,
      lang,
      capturedAt: new Date().toISOString(),
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPES.EXTRACT_PAGE_DATA) {
    return false;
  }

  try {
    const response = extractPageData();
    sendResponse(response);
  } catch (error) {
    sendResponse({
      ok: false,
      error: error?.message ?? "Failed to capture page HTML.",
    });
  }

  return false;
});
