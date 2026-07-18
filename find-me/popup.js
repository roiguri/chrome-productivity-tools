// popup.js
const MAX_REFERENCE_PHOTOS = 5;
const REFERENCE_PHOTO_MAX_DIM = 400;
const REFERENCE_PHOTO_QUALITY = 0.8;

// Face-check results are persisted (aligned with referenceImages) so they are
// NOT recomputed on every popup open -- only images without a stored result
// (i.e. newly added, or a check that never finished) get checked. Stored values
// are true (face) | false (none) | 'error'; a missing/null entry means unchecked.
// inFlightChecks guards against launching the same check twice.
const inFlightChecks = new Set();

const FACE_CHECK_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function loadFaceApiScript() {
  return new Promise((resolve, reject) => {
    console.log('[Find Me] Loading face-api for photo validation…');
    const script = document.createElement('script');
    script.src = 'face-api.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load face-api.min.js'));
    document.head.appendChild(script);
  });
}

// Load the tiny detector model with explicit URLs. face-api's loadFromUri()
// mangles chrome-extension:// URLs (its parser assumes http/https), so we fetch
// the manifest ourselves and hand face-api a base URL it won't rewrite.
async function loadTinyDetector() {
  const base = chrome.runtime.getURL('models/');
  const manifestUrl = base + 'tiny_face_detector_model-weights_manifest.json';
  console.log('[Find Me] Fetching model manifest:', manifestUrl);
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`model manifest HTTP ${res.status}`);
  const manifest = await res.json();
  const weightMap = await faceapi.tf.io.loadWeights(manifest, base);
  await faceapi.nets.tinyFaceDetector.loadFromWeightMap(weightMap);
}

// Lazily load face-api + the tiny detector model only when we first need to
// validate a photo, so opening the popup stays fast.
let faceApiReady = null;
function ensureFaceApi() {
  if (!faceApiReady) {
    faceApiReady = loadFaceApiScript()
      .then(loadTinyDetector)
      .then(() => console.log('[Find Me] Face validator ready. TF backend:', faceapi.tf.getBackend()))
      .catch(err => { faceApiReady = null; throw err; }); // allow a later retry
  }
  return faceApiReady;
}

function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

async function detectFace(dataUrl) {
  await ensureFaceApi();
  const img = await decodeImage(dataUrl);
  const started = performance.now();
  const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions());
  console.log(`[Find Me] Face check: ${detection ? 'face found' : 'no face'} in ${Math.round(performance.now() - started)}ms`);
  return !!detection;
}

document.addEventListener('DOMContentLoaded', () => {
  const authBtn = document.getElementById('auth-btn');
  const authStatus = document.getElementById('auth-status');
  const authError = document.getElementById('auth-error');

  const referencePhotosInput = document.getElementById('reference-photos');
  const referenceThumbs = document.getElementById('reference-thumbs');
  const referenceStatus = document.getElementById('reference-status');
  const scanBtn = document.getElementById('scan-btn');
  const scanStatus = document.getElementById('scan-status');
  const sensitivity = document.getElementById('sensitivity');
  const sensLabelEl = document.getElementById('sens-label');

  // Map the raw euclidean-distance cutoff to a plain-language label. Smaller
  // distance = stricter (fewer, surer matches); larger = looser.
  const sensLabel = (v) => (v <= 0.5 ? 'Strict' : v <= 0.6 ? 'Balanced' : 'Loose');

  // Restore the saved strictness, then keep it in sync + persisted as it moves.
  chrome.storage.local.get(['matchThreshold']).then(({ matchThreshold }) => {
    if (typeof matchThreshold === 'number') sensitivity.value = String(matchThreshold);
    sensLabelEl.textContent = sensLabel(parseFloat(sensitivity.value));
  });
  sensitivity.addEventListener('input', () => {
    const v = parseFloat(sensitivity.value);
    sensLabelEl.textContent = sensLabel(v);
    chrome.storage.local.set({ matchThreshold: v });
  });

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

  // Read images + their persisted face-check results, aligned by index.
  // faces entries: true | false | 'error' | null (unchecked).
  async function getReference() {
    const { referenceImages, referenceFaces } =
      await chrome.storage.local.get(['referenceImages', 'referenceFaces']);
    const images = referenceImages || [];
    const faces = (referenceFaces || []).slice(0, images.length);
    while (faces.length < images.length) faces.push(null);
    return { images, faces };
  }

  async function saveReference(images, faces) {
    await chrome.storage.local.set({ referenceImages: images, referenceFaces: faces });
    renderReferencePhotos(images, faces);
  }

  const FACE_BADGES = {
    true:  { text: '✓', bg: '#0f9d58', title: 'Face detected' },
    false: { text: '⚠', bg: '#d93025', title: 'No face detected — this photo will be ignored' },
    null:  { text: '…', bg: '#5f6368', title: 'Checking for a face…' },
    error: { text: '?', bg: '#5f6368', title: 'Could not check this photo' },
  };

  // Serialize storage read-modify-writes so concurrent checks can't clobber each
  // other's results.
  let writeChain = Promise.resolve();
  function serializeWrite(fn) {
    writeChain = writeChain.then(fn, fn);
    return writeChain;
  }

  // Check one image and store its result. Runs only for images without a result
  // yet; guarded so the same image is never checked twice concurrently. Matches
  // the result back by image data, so it's robust to removals mid-check.
  async function checkAndStore(dataUrl) {
    if (inFlightChecks.has(dataUrl)) return;
    inFlightChecks.add(dataUrl);
    let result;
    try {
      result = await withTimeout(detectFace(dataUrl), FACE_CHECK_TIMEOUT_MS, 'Face check');
    } catch (e) {
      console.warn('[Find Me] Face check failed:', e);
      result = 'error';
    }
    inFlightChecks.delete(dataUrl);

    await serializeWrite(async () => {
      const { images, faces } = await getReference();
      const idx = images.indexOf(dataUrl);
      if (idx !== -1) {
        faces[idx] = result;
        await saveReference(images, faces);
      }
    });
  }

  // Draw a thumbnail (remove button + face-check badge) per photo. Only images
  // that have no stored result yet get checked -- resolved ones are never
  // re-run, so reopening the popup does no work when everything is already known.
  function renderReferencePhotos(images, faces) {
    referenceThumbs.innerHTML = '';
    images.forEach((dataUrl, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';

      const img = document.createElement('img');
      img.src = dataUrl;

      const remove = document.createElement('button');
      remove.className = 'thumb-remove';
      remove.textContent = '×';
      remove.title = 'Remove photo';
      remove.addEventListener('click', () => {
        // Remove by identity (not the captured index), serialized so it can't
        // race with in-flight face-check writes.
        serializeWrite(async () => {
          const { images, faces } = await getReference();
          const idx = images.indexOf(dataUrl);
          if (idx !== -1) {
            images.splice(idx, 1);
            faces.splice(idx, 1);
            await saveReference(images, faces);
          }
        });
      });

      const badgeInfo = FACE_BADGES[faces[index]] || FACE_BADGES.null;
      const badge = document.createElement('div');
      badge.className = 'thumb-badge';
      badge.textContent = badgeInfo.text;
      badge.title = badgeInfo.title;
      badge.style.background = badgeInfo.bg;

      wrap.appendChild(img);
      wrap.appendChild(remove);
      wrap.appendChild(badge);
      referenceThumbs.appendChild(wrap);

      // Check only if this image has no stored result (newly added / interrupted).
      if (faces[index] == null) checkAndStore(dataUrl);
    });

    scanBtn.disabled = images.length === 0;

    const pendingCount = faces.filter(f => f == null).length;
    const noFaceCount = faces.filter(f => f === false).length;
    if (!images.length) {
      referenceStatus.textContent = '';
    } else if (pendingCount) {
      referenceStatus.textContent = `Checking ${pendingCount} photo(s) for a face…`;
    } else if (noFaceCount) {
      referenceStatus.textContent = `${images.length} of ${MAX_REFERENCE_PHOTOS} photos — ${noFaceCount} without a detectable face.`;
    } else {
      referenceStatus.textContent = `${images.length} of ${MAX_REFERENCE_PHOTOS} photos.`;
    }
  }

  // Restore saved reference photos on open; renders stored results, no re-check.
  // Also heal any pre-existing duplicate images (from before de-dupe on add),
  // which would otherwise trigger a re-check loop.
  getReference().then(({ images, faces }) => {
    const seen = new Set();
    const dedupImages = [];
    const dedupFaces = [];
    images.forEach((dataUrl, i) => {
      if (seen.has(dataUrl)) return;
      seen.add(dataUrl);
      dedupImages.push(dataUrl);
      dedupFaces.push(faces[i]);
    });
    if (dedupImages.length !== images.length) {
      saveReference(dedupImages, dedupFaces); // saves + renders the cleaned set
    } else {
      renderReferencePhotos(images, faces);
    }
  });

  referencePhotosInput.addEventListener('change', async () => {
    const files = Array.from(referencePhotosInput.files);
    if (files.length === 0) return;

    try {
      referenceStatus.textContent = 'Processing photos...';
      const resized = await Promise.all(files.map(resizeImageFile));

      // Append inside the write lock, de-duping against the current set and
      // within this batch. Duplicate data URLs must never coexist -- identical
      // images break the indexOf-based result mapping and cause a re-check loop.
      await serializeWrite(async () => {
        const { images, faces } = await getReference();
        const room = MAX_REFERENCE_PHOTOS - images.length;
        if (room <= 0) {
          referenceStatus.textContent = `Max ${MAX_REFERENCE_PHOTOS} photos. Remove one to add more.`;
          return;
        }

        const have = new Set(images);
        const toAdd = [];
        for (const dataUrl of resized) {
          if (have.has(dataUrl)) continue; // already added (same photo)
          have.add(dataUrl);
          toAdd.push(dataUrl);
          if (toAdd.length >= room) break;
        }

        if (toAdd.length === 0) {
          referenceStatus.textContent = 'Those photos are already added.';
          return;
        }

        await saveReference(images.concat(toAdd), faces.concat(toAdd.map(() => null)));
      });
    } catch (e) {
      console.error('[Find Me] Failed to process reference photos:', e);
      referenceStatus.textContent = 'Error processing photos.';
    } finally {
      // Reset so re-selecting the same file still fires 'change'.
      referencePhotosInput.value = '';
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

    const threshold = parseFloat(sensitivity.value);
    const scanMessage = { action: 'startScan', referenceImages, autoScroll, threshold };

    // Tell background or content script to start scanning. Once the scan is
    // under way we close the popup so the results bar on the page is unobstructed;
    // we only keep the popup open to surface an error (e.g. an unscannable page).
    chrome.tabs.sendMessage(tab.id, scanMessage, (response) => {
      if (chrome.runtime.lastError) {
        // Content script probably not injected yet
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['face-api.min.js', 'adapters.js', 'content.js']
        }).then(() => {
          // Try sending the message again, then step aside.
          chrome.tabs.sendMessage(tab.id, scanMessage);
          window.close();
        }).catch(err => {
          scanStatus.textContent = "Error: Cannot run on this page.";
          scanBtn.disabled = false;
          console.error(err);
        });
      } else {
        window.close();
      }
    });
  });
});
