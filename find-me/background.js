// background.js
let authToken = null;

// Handle getting the auth token via chrome.identity
async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      authToken = token;
      resolve(token);
    });
  });
}

// Helper for Google Photos API requests
async function photosApiRequest(endpoint, options = {}) {
  const token = await getAuthToken(false).catch(() => null);
  if (!token) throw new Error("Not authenticated");

  const url = `https://photoslibrary.googleapis.com/v1/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Photos API Error: ${response.status} - ${errorText}`);
  }

  // Some endpoints return no JSON (e.g., uploads)
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

// Upload a single image (from base64 or blob URL data) to Google Photos
async function uploadImage(dataUrl, fileName) {
  // First, upload the raw bytes to get an upload token
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const token = await getAuthToken(false);
  const uploadResponse = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-Goog-Upload-Content-Type': blob.type || 'image/jpeg',
      'X-Goog-Upload-Protocol': 'raw'
    },
    body: blob
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload image bytes');
  }

  const uploadToken = await uploadResponse.text();

  // Create a media item using the upload token
  const createResult = await photosApiRequest('mediaItems:batchCreate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newMediaItems: [{
        description: `Uploaded by Find Me extension - ${fileName}`,
        simpleMediaItem: { uploadToken }
      }]
    })
  });

  return createResult;
}

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "authenticate") {
    getAuthToken(true)
      .then(token => sendResponse({ success: true, token }))
      .catch(error => {
        console.error('[Find Me] authenticate failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "checkAuth") {
    getAuthToken(false)
      .then(token => sendResponse({ success: true, token }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (request.action === "uploadImage") {
    uploadImage(request.dataUrl, request.fileName)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => {
        console.error('[Find Me] uploadImage failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
