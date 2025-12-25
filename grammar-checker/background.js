chrome.commands.onCommand.addListener((command) => {
  if (command === 'check-grammar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      const tabId = tabs[0].id;

      // Try to send message
      chrome.tabs.sendMessage(tabId, { action: 'checkGrammar' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Content script not ready. Injecting...', chrome.runtime.lastError.message);

            // Injection logic
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Injection failed:', chrome.runtime.lastError.message);
                    return;
                }

                // Also inject CSS if needed, though manifest usually handles it.
                // Dynamically injected scripts might need CSS injected too if not already there.
                chrome.scripting.insertCSS({
                    target: { tabId: tabId },
                    files: ['styles.css']
                }, () => {
                    // Retry message
                    chrome.tabs.sendMessage(tabId, { action: 'checkGrammar' });
                });
            });
        }
      });
    });
  }
});
