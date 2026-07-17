// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const authBtn = document.getElementById('auth-btn');
  const authSection = document.getElementById('auth-section');
  const mainSection = document.getElementById('main-section');
  const authError = document.getElementById('auth-error');

  const albumSelect = document.getElementById('album-select');
  const scanBtn = document.getElementById('scan-btn');
  const albumStatus = document.getElementById('album-status');
  const scanStatus = document.getElementById('scan-status');

  // Check initial auth state
  chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
    if (response && response.success) {
      showMainUI();
    }
  });

  // Handle Authentication
  authBtn.addEventListener('click', () => {
    authBtn.disabled = true;
    authBtn.textContent = 'Authenticating...';

    chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
      if (response && response.success) {
        showMainUI();
      } else {
        authBtn.disabled = false;
        authBtn.textContent = 'Sign in with Google';
        authError.textContent = response ? response.error : 'Authentication failed';
        authError.classList.remove('hidden');
      }
    });
  });

  function showMainUI() {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    loadAlbums();
  }

  // Load albums from Google Photos
  function loadAlbums() {
    chrome.runtime.sendMessage({ action: 'getAlbums' }, (response) => {
      if (response && response.success) {
        albumSelect.innerHTML = '<option value="">-- Select an album --</option>';
        response.albums.forEach(album => {
          const option = document.createElement('option');
          option.value = album.id;
          option.textContent = album.title + ` (${album.mediaItemsCount || 0} items)`;
          albumSelect.appendChild(option);
        });

        // Load previously selected album
        chrome.storage.local.get(['selectedAlbumId'], (result) => {
          if (result.selectedAlbumId) {
            albumSelect.value = result.selectedAlbumId;
            scanBtn.disabled = false;
          }
        });
      } else {
        const errorMessage = response ? response.error : 'No response from background script';
        console.error('[Find Me] getAlbums failed:', errorMessage);
        albumSelect.innerHTML = '<option value="">Error loading albums</option>';
        albumStatus.textContent = errorMessage;
      }
    });
  }

  // Save album selection
  albumSelect.addEventListener('change', () => {
    const albumId = albumSelect.value;
    if (albumId) {
      chrome.storage.local.set({ selectedAlbumId: albumId });
      scanBtn.disabled = false;
      albumStatus.textContent = "Album selected.";
    } else {
      scanBtn.disabled = true;
      chrome.storage.local.remove(['selectedAlbumId']);
      albumStatus.textContent = "";
    }
  });

  // Trigger scan on the active tab
  scanBtn.addEventListener('click', async () => {
    const albumId = albumSelect.value;
    if (!albumId) return;

    scanBtn.disabled = true;
    scanStatus.textContent = "Initializing scanner...";

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      scanStatus.textContent = "Error: No active tab found.";
      scanBtn.disabled = false;
      return;
    }

    // Tell background or content script to start scanning
    chrome.tabs.sendMessage(tab.id, {
      action: 'startScan',
      albumId: albumId
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script probably not injected yet
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['face-api.min.js', 'content.js']
        }).then(() => {
          // Try sending the message again
          chrome.tabs.sendMessage(tab.id, {
            action: 'startScan',
            albumId: albumId
          });
          scanStatus.textContent = "Scan started! See page for details.";
        }).catch(err => {
          scanStatus.textContent = "Error: Cannot run on this page.";
          console.error(err);
        });
      } else {
        scanStatus.textContent = "Scan started! See page for details.";
      }

      setTimeout(() => {
        scanBtn.disabled = false;
      }, 3000);
    });
  });
});
