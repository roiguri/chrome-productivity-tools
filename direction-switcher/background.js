chrome.runtime.onInstalled.addListener(() => {
  console.log("Direction Switcher installed.");
});

function togglePicker(tab) {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { action: "togglePicker" }).catch((err) => {
    // If content script is not ready (e.g. restricted page or not loaded), ignore
    console.warn("Could not send message to tab:", err);
  });
}

// Listen for keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-picker") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      togglePicker(tabs[0]);
    });
  }
});

// Listen for browser action click
chrome.action.onClicked.addListener((tab) => {
  togglePicker(tab);
});
