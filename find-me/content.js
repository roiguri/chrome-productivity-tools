// content.js
let modelsLoaded = false;
let referenceDescriptor = null;
let container = null;

const SCAN_MAX_DIM = 640;   // px: downscale page images before detection for speed
const THUMB_MAX_DIM = 200;  // px: small thumbnails for the results drawer
let backendFellBack = false;

// Draw an image onto a canvas, downscaled so its longest side is <= maxDim.
// Feeding face-api a smaller image massively cuts per-image work (a gallery of
// multi-thousand-pixel photos is the slow case), and the downscaled canvas
// doubles as a cheap thumbnail.
function downscaleToCanvas(img, maxDim) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Run a face-api detection on the fast WebGL backend, falling back to CPU once
// if WebGL errors (some GPUs have a broken float path). The fallback is sticky
// so we don't thrash backends mid-scan.
async function withBackendFallback(run) {
  try {
    return await run();
  } catch (e) {
    if (!backendFellBack && faceapi.tf.getBackend() === 'webgl') {
      console.warn('[Find Me] WebGL detection failed; switching to CPU backend.', e);
      backendFellBack = true;
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      return await run();
    }
    throw e;
  }
}

// Ask the background service worker to fetch a URL's bytes and return them as a
// data URL. In MV3 a content-script fetch is bound to the page origin and stays
// subject to CORS; only the service worker can fetch cross-origin under the
// extension's <all_urls> host permission.
function fetchImageViaBackground(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'fetchImage', url }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response && response.success) {
        resolve(response.dataUrl);
      } else {
        reject(new Error(response ? response.error : 'Failed to fetch image'));
      }
    });
  });
}

// Load an <img> from a URL. data: URLs (our locally-picked reference photos)
// load directly. Cross-origin page images are fetched via the background worker
// and returned as a data URL, which canvas/face-api treat as same-origin
// regardless of the original host (and which is never CORS-tainted).
async function loadImage(url) {
  const decode = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
  });

  const src = url.startsWith('data:') ? url : await fetchImageViaBackground(url);
  return decode(src);
}

// Ensure face-api models are loaded
async function loadModels() {
  if (modelsLoaded) return;

  // Prefer the WebGL backend for speed; withBackendFallback() drops to CPU if a
  // detection ever fails on WebGL (a broken-float-path GPU).
  await faceapi.tf.setBackend('webgl');
  await faceapi.tf.ready();
  console.log('[Find Me] TF backend:', faceapi.tf.getBackend());

  const modelUrl = chrome.runtime.getURL('models');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
  await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
  await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
  modelsLoaded = true;
}

// Compute a single reference descriptor by taking the mean of all found face descriptors
// across the reference photos the user picked locally (data URLs from popup.js).
async function computeReferenceDescriptor(referenceImages) {
  const descriptors = [];

  for (let i = 0; i < referenceImages.length; i++) {
    updateStatus(`Reading reference photo ${i + 1} of ${referenceImages.length}...`);
    try {
      const img = await loadImage(referenceImages[i]);
      const detection = await withBackendFallback(() =>
        faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
      );

      if (detection) {
        descriptors.push(detection.descriptor);
      } else {
        console.warn(`[Find Me] No face detected in reference photo ${i + 1}`);
      }
    } catch (e) {
      console.warn(`[Find Me] Failed to process reference photo ${i + 1}`, e);
    }
  }

  updateStatus(`Found a face in ${descriptors.length} of ${referenceImages.length} reference photo(s).`);

  if (descriptors.length === 0) {
    throw new Error("No faces found in your reference photos. Try clearer, front-facing photos.");
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
// Upload the matched image to Google Photos. The background worker fetches the
// original image bytes and uploads them unchanged -- no canvas re-encode -- so
// the source image's quality is preserved exactly.
async function uploadToGooglePhotos(imgEl) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'uploadImage',
      url: imgEl.currentSrc || imgEl.src,
      fileName: 'found-image.jpg'
    }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response && response.success) {
        resolve(response.result);
      } else {
        reject(new Error(response ? response.error : 'Upload failed'));
      }
    });
  });
}

// Render a found image in the UI with actions. thumbSrc is a small downscaled
// data URL so the drawer stays light even with many matches; imgEl is kept for
// the full-resolution upload.
function addMatchToUI(imgEl, thumbSrc) {
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
  thumb.src = thumbSrc || imgEl.src;
  thumb.loading = 'lazy';
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
  content.appendChild(item);
}

// Scan a single already-loaded <img> for a match, appending to the drawer if
// the reference face is found. Returns true if it was a match.
async function scanImage(img) {
  const fullImg = await loadImage(img.currentSrc || img.src);
  // Detect on a downscaled copy -- far less work than full-res photos, and
  // face-api resizes to its own input size internally anyway.
  const scanCanvas = downscaleToCanvas(fullImg, SCAN_MAX_DIM);

  const detections = await withBackendFallback(() =>
    faceapi.detectAllFaces(scanCanvas).withFaceLandmarks().withFaceDescriptors()
  );

  for (const detection of detections) {
    const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
    // Distance < 0.6 is generally considered a match for this model
    if (distance < 0.6) {
      const thumbSrc = downscaleToCanvas(fullImg, THUMB_MAX_DIM).toDataURL('image/jpeg', 0.8);
      addMatchToUI(img, thumbSrc);
      return true;
    }
  }
  return false;
}

// Main scan logic. When autoScroll is set, the page is scrolled progressively
// and newly loaded images are scanned as they appear (streaming), rather than
// waiting for the whole gallery to load first.
async function runScan(referenceImages, autoScroll) {
  setupUI();
  updateStatus("Loading AI Models...");

  const AUTO_SCROLL_STEP = 0.8;      // fraction of viewport height per scroll
  const LAZY_LOAD_WAIT_MS = 600;     // give lazy images time to load after scroll
  const IDLE_PASSES_TO_STOP = 3;     // stop after N bottom passes yield nothing new
  const MAX_SCROLL_PASSES = 1000;    // hard safety cap against runaway pages

  try {
    await loadModels();

    if (!referenceDescriptor) {
      updateStatus("Processing reference photos...");
      referenceDescriptor = await computeReferenceDescriptor(referenceImages);
    }

    const seen = new Set();
    let scannedCount = 0;
    let matchCount = 0;

    // Scan every currently-loaded image we haven't seen yet. Returns how many
    // new images were processed this pass.
    const scanNewImages = async () => {
      const fresh = Array.from(document.querySelectorAll('img')).filter(img => {
        const key = img.currentSrc || img.src;
        return key && !seen.has(key) && img.naturalWidth > 50 && img.naturalHeight > 50;
      });

      for (const img of fresh) {
        seen.add(img.currentSrc || img.src);
        scannedCount++;
        updateStatus(`Scanning… ${scannedCount} images, ${matchCount} match(es)`);
        try {
          if (await scanImage(img)) matchCount++;
        } catch (e) {
          console.warn("Could not process image", img.currentSrc || img.src, e);
        }
        // Yield so the browser can paint/scroll during a long scan.
        await new Promise(resolve => setTimeout(resolve));
      }
      return fresh.length;
    };

    if (!autoScroll) {
      updateStatus("Scanning images on page...");
      await scanNewImages();
    } else {
      let idlePasses = 0;
      let passes = 0;
      while (passes < MAX_SCROLL_PASSES) {
        passes++;
        const found = await scanNewImages();

        const atBottom =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

        if (found === 0 && atBottom) {
          if (++idlePasses >= IDLE_PASSES_TO_STOP) break;
        } else {
          idlePasses = 0;
        }

        // Scroll down to trigger more lazy loading, then wait for it.
        window.scrollBy(0, Math.round(window.innerHeight * AUTO_SCROLL_STEP));
        await new Promise(resolve => setTimeout(resolve, LAZY_LOAD_WAIT_MS));
      }
      if (passes >= MAX_SCROLL_PASSES) {
        console.warn('[Find Me] Reached max scroll passes; stopping scan early.');
      }
    }

    const status = document.getElementById('find-me-status');
    if (status) {
      status.style.display = 'block';
      status.textContent = `Scan complete. Scanned ${scannedCount} images, found ${matchCount} match(es).`;
    }

  } catch (error) {
    console.error("Scan Error:", error);
    updateStatus(`Error: ${error.message}`);
  }
}

// Listen for trigger from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startScan') {
    runScan(request.referenceImages, request.autoScroll);
    sendResponse({ started: true });
  }
});
