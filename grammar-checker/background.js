// Listen for the shortcut command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "check_grammar") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      // Use sendMessage to trigger the content script
      // If the content script isn't loaded (e.g. freshly installed), we might need to inject it first?
      // Manifest V3 content scripts are auto-injected on page load, but for pages opened BEFORE install, they might be missing.
      // However, typical workflow assumes reload. For robustness, we can try-catch.

      try {
        await chrome.tabs.sendMessage(tab.id, { action: "check_grammar" });
      } catch (e) {
        // If message fails, try injecting the script manually (lazy injection)
        // This is a common pattern to support tabs open before install
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['content.js']
          });
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id, allFrames: true },
            files: ['styles.css']
          });
          // Retry sending message
          await chrome.tabs.sendMessage(tab.id, { action: "check_grammar" });
        } catch (injectionError) {
          console.error("Failed to inject or communicate with content script:", injectionError);
        }
      }
    }
  }
});

// Handle API requests from content script to avoid CORS issues
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "check_text_api") {
    checkTextWithApi(request.text)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
});

async function checkTextWithApi(text) {
  const params = new URLSearchParams();
  params.append("text", text);
  params.append("language", "en-US"); // Defaulting to US English for now

  const response = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: params
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return await response.json();
}
