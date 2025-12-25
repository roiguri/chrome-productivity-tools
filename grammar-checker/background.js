chrome.commands.onCommand.addListener((command) => {
  if (command === 'check-grammar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      const tabId = tabs[0].id;
      // We need to ensure the content script is injected if not already.
      // However, manifest defines it for <all_urls>, so it should be there.
      // But for robust handling on some pages (like chrome://), we catch errors.

      chrome.tabs.sendMessage(tabId, { action: 'checkGrammar' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Could not send message. Content script might not be ready or page is restricted.');
        }
      });
    });
  }
});
