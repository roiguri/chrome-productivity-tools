// popup.js
const MAX_REFERENCE_PHOTOS = 5;
const REFERENCE_PHOTO_MAX_DIM = 400;
const REFERENCE_PHOTO_QUALITY = 0.8;

document.addEventListener('DOMContentLoaded', () => {
  const authBtn = document.getElementById('auth-btn');
  const authStatus = document.getElementById('auth-status');
  const authError = document.getElementById('auth-error');

  const referencePhotosInput = document.getElementById('reference-photos');
  const referenceStatus = document.getElementById('reference-status');
  const scanBtn = document.getElementById('scan-btn');
  const scanStatus = document.getElementById('scan-status');

  // Reflect whatever auth state already exists, without gating the rest of the UI on it.
  chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
    if (response && response.success) showAuthenticated();
  });

  authBtn.addEventListener('click', () => {
    authBtn.disabled = true;
    authBtn.textContent = 'Authenticating...';

    chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
      if (response && response.success) {
        showAuthenticated();
      } else {
        authBtn.disabled = false;
        authBtn.textContent = 'Sign in with Google';
        authError.textContent = response ? response.error : 'Authentication failed';
        authError.classList.remove('hidden');
      }
    });
  });

  function showAuthenticated() {
    authBtn.classList.add('hidden');
    authError.classList.add('hidden');
    authStatus.textContent = 'Connected. "Save to Photos" is enabled on scan results.';
  }

  // Resize a locally-picked photo down to a small JPEG data URL, both to keep
  // face detection fast and to stay well within chrome.storage.local's quota.
  function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, REFERENCE_PHOTO_MAX_DIM / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', REFERENCE_PHOTO_QUALITY));
        };
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  function setReferenceStatus(count) {
    referenceStatus.textContent = count > 0 ? `${count} photo(s) saved.` : '';
    scanBtn.disabled = count === 0;
  }

  // Restore previously saved reference photos so re-opening the popup doesn't lose them.
  chrome.storage.local.get(['referenceImages'], (result) => {
    setReferenceStatus((result.referenceImages || []).length);
  });

  referencePhotosInput.addEventListener('change', async () => {
    const files = Array.from(referencePhotosInput.files).slice(0, MAX_REFERENCE_PHOTOS);
    if (files.length === 0) return;

    referenceStatus.textContent = 'Processing photos...';
    try {
      const referenceImages = await Promise.all(files.map(resizeImageFile));
      await chrome.storage.local.set({ referenceImages });
      setReferenceStatus(referenceImages.length);
    } catch (e) {
      console.error('[Find Me] Failed to process reference photos:', e);
      referenceStatus.textContent = 'Error processing photos.';
    }
  });

  // Trigger scan on the active tab
  const autoScrollCheckbox = document.getElementById('auto-scroll');

  scanBtn.addEventListener('click', async () => {
    const { referenceImages } = await chrome.storage.local.get(['referenceImages']);
    if (!referenceImages || referenceImages.length === 0) return;

    const autoScroll = autoScrollCheckbox.checked;

    scanBtn.disabled = true;
    scanStatus.textContent = "Initializing scanner...";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      scanStatus.textContent = "Error: No active tab found.";
      scanBtn.disabled = false;
      return;
    }

    const scanMessage = { action: 'startScan', referenceImages, autoScroll };

    // Tell background or content script to start scanning
    chrome.tabs.sendMessage(tab.id, scanMessage, (response) => {
      if (chrome.runtime.lastError) {
        // Content script probably not injected yet
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['face-api.min.js', 'content.js']
        }).then(() => {
          // Try sending the message again
          chrome.tabs.sendMessage(tab.id, scanMessage);
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
