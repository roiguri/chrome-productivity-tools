chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-language') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs.length === 0) return;
      
      chrome.tabs.sendMessage(tabs[0].id, {action: 'swapText'})
        .catch(err => console.log('Could not send message to tab (content script might not be loaded):', err));
    });
  }
});