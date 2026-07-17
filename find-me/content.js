// content.js
let modelsLoaded = false;
let referenceDescriptor = null;
let container = null;

// Fetch image bytes directly (bypasses the target site's CORS policy via the
// extension's <all_urls> host permission) and load them as a blob: URL, which
// canvas/face-api treat as same-origin regardless of the original host.
async function loadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = blobUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to decode image'));
    });
    return img;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// Ensure face-api models are loaded
async function loadModels() {
  if (modelsLoaded) return;
  const modelUrl = chrome.runtime.getURL('models');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
  await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
  await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
  modelsLoaded = true;
}

// Fetch reference images from the selected Google Photos album
async function getReferenceImages(albumId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'getAlbumMedia', albumId }, (response) => {
      if (response && response.success) {
        resolve(response.mediaItems || []);
      } else {
        reject(new Error(response ? response.error : 'Unknown error fetching album media'));
      }
    });
  });
}

// Compute a single reference descriptor by taking the mean of all found face descriptors in the album
async function computeReferenceDescriptor(albumMediaItems) {
  const descriptors = [];

  for (let i = 0; i < Math.min(albumMediaItems.length, 5); i++) { // Limit to 5 for speed
    const item = albumMediaItems[i];
    if (!item.baseUrl) continue;

    try {
      const img = await loadImage(item.baseUrl + '=w500-h500'); // Append sizing for Google Photos API

      const detection = await faceapi.detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        descriptors.push(detection.descriptor);
      }
    } catch (e) {
      console.warn("Failed to process reference image", e);
    }
  }

  if (descriptors.length === 0) {
    throw new Error("No faces found in reference album");
  }

  // Calculate the average descriptor
  const avgDescriptor = new Float32Array(128);
  for (let i = 0; i < 128; i++) {
    let sum = 0;
    for (let j = 0; j < descriptors.length; j++) {
      sum += descriptors[j][i];
    }
    avgDescriptor[i] = sum / descriptors.length;
  }

  return avgDescriptor;
}

// Setup the UI Container (Drawer) for results
function setupUI() {
  if (container) return;

  container = document.createElement('div');
  container.id = 'find-me-drawer';
  // Use fixed positioning as per memory constraints to avoid layout side-effects
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    max-height: 80vh;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999999;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    background: #4285F4;
    color: white;
    padding: 12px 16px;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = `<span>Find Me</span><button id="find-me-close" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;">&times;</button>`;

  const content = document.createElement('div');
  content.id = 'find-me-content';
  content.style.cssText = `
    padding: 16px;
    overflow-y: auto;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  content.innerHTML = '<div id="find-me-status" style="color:#666;font-size:14px;">Initializing...</div>';

  container.appendChild(header);
  container.appendChild(content);
  document.body.appendChild(container);

  document.getElementById('find-me-close').addEventListener('click', () => {
    container.remove();
    container = null;
  });
}

function updateStatus(text) {
  const statusEl = document.getElementById('find-me-status');
  if (statusEl) statusEl.textContent = text;
}

// Convert an image element to a data URL, fetching bytes directly so the
// canvas is never tainted regardless of the source's CORS policy.
async function getImageDataUrl(imgEl) {
  const img = await loadImage(imgEl.src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || imgEl.naturalWidth;
  canvas.height = img.naturalHeight || imgEl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/jpeg');
}

// Upload the image to Google Photos
async function uploadToGooglePhotos(imgEl) {
  return new Promise(async (resolve, reject) => {
    try {
      const dataUrl = await getImageDataUrl(imgEl);
      chrome.runtime.sendMessage({
        action: 'uploadImage',
        dataUrl: dataUrl,
        fileName: 'found-image.jpg'
      }, (response) => {
        if (response && response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response ? response.error : 'Upload failed'));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Render a found image in the UI with actions
function addMatchToUI(imgEl) {
  const content = document.getElementById('find-me-content');
  if (!content) return;

  const item = document.createElement('div');
  item.style.cssText = `
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  const thumb = document.createElement('img');
  thumb.src = imgEl.src;
  thumb.style.cssText = `
    width: 100%;
    height: auto;
    max-height: 150px;
    object-fit: contain;
    border-radius: 4px;
  `;

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Save to Photos';
  uploadBtn.style.cssText = `
    flex: 1;
    background: #4285F4;
    color: white;
    border: none;
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;

  uploadBtn.addEventListener('click', async () => {
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Saving...';
    try {
      await uploadToGooglePhotos(imgEl);
      uploadBtn.textContent = 'Saved!';
      uploadBtn.style.background = '#0f9d58';
    } catch (e) {
      console.error(e);
      uploadBtn.textContent = 'Error';
      uploadBtn.style.background = '#d93025';
    }
  });

  actions.appendChild(uploadBtn);
  item.appendChild(thumb);
  item.appendChild(actions);

  // Remove status if it's the first image
  const status = document.getElementById('find-me-status');
  if (status && status.textContent.includes('Scanning')) {
    status.style.display = 'none';
  }

  content.appendChild(item);
}

// Main scan logic
async function runScan(albumId) {
  setupUI();
  updateStatus("Loading AI Models...");

  try {
    await loadModels();

    if (!referenceDescriptor) {
      updateStatus("Fetching reference face...");
      const mediaItems = await getReferenceImages(albumId);
      referenceDescriptor = await computeReferenceDescriptor(mediaItems);
    }

    updateStatus("Scanning images on page...");

    // Find all standard img tags (can be expanded later)
    const images = Array.from(document.querySelectorAll('img')).filter(img =>
      img.naturalWidth > 50 && img.naturalHeight > 50 && img.src
    );

    let matchCount = 0;

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      updateStatus(`Scanning image ${i + 1} of ${images.length}...`);

      try {
        const imgClone = await loadImage(img.src);

        const detections = await faceapi.detectAllFaces(imgClone)
          .withFaceLandmarks()
          .withFaceDescriptors();

        for (const detection of detections) {
          // Euclidean distance between reference and found descriptor
          const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);

          // Distance < 0.6 is generally considered a match for this model
          if (distance < 0.6) {
            addMatchToUI(img);
            matchCount++;
            break; // Move to next image once we find you
          }
        }
      } catch (e) {
        console.warn("Could not process image", img.src, e);
      }
    }

    const status = document.getElementById('find-me-status');
    if (status) {
      status.style.display = 'block';
      status.textContent = `Scan complete. Found ${matchCount} matches.`;
    }

  } catch (error) {
    console.error("Scan Error:", error);
    updateStatus(`Error: ${error.message}`);
  }
}

// Listen for trigger from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startScan') {
    runScan(request.albumId);
    sendResponse({ started: true });
  }
});
