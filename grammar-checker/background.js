chrome.commands.onCommand.addListener((command) => {
  if (command === 'check-grammar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      const tabId = tabs[0].id;

      // Try to send message.
      // Note: By default chrome.tabs.sendMessage sends to all frames unless frameId is specified (in some contexts),
      // BUT actually it sends to the top frame only if options are not set?
      // Documentation says: "The message is sent to all frames in the tab." (Wait, let's verify).
      // Actually, docs say: "Sends a single message to the content script(s) in the specified tab... If specific frames are not specified... the message is sent to all frames in the tab."
      // So all frames receive it.

      chrome.tabs.sendMessage(tabId, { action: 'checkGrammar' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Content script not ready. Injecting...', chrome.runtime.lastError.message);

            // Injection logic
            // We inject into ALL frames to ensure we catch iframes (like Colab).
            chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ['content.js']
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Injection failed:', chrome.runtime.lastError.message);
                    return;
                }

                chrome.scripting.insertCSS({
                    target: { tabId: tabId, allFrames: true },
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
