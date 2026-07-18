// content.js

// face-api reads pixels off 2D canvases with getImageData on nearly every image
// it processes (its own createCanvasFromMedia path, plus our downscale below).
// Chrome floods the console with "getImageData is faster with willReadFrequently"
// for each of those readbacks. face-api calls getContext('2d') with no options,
// so we default the flag on here. This runs in the content script's isolated
// world, so it only affects canvases created by our code and face-api, never the
// host page's own canvases.
(function forceWillReadFrequently() {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === '2d') {
      attrs = Object.assign({ willReadFrequently: true }, attrs);
    }
    return orig.call(this, type, attrs);
  };
})();

let modelsLoaded = false;
let referenceDescriptor = null;
let container = null;
let scanAborted = false; // set when the user closes the bar or stops mid-scan
let matchThreshold = 0.6; // euclidean distance cutoff; set per-scan from the popup slider

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
    if (scanAborted) break;
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

// ---------------------------------------------------------------------------
// Results UI: a slim "bar" that accumulates matches during a scan, plus a
// roomy, selectable "gallery" (View all) for reviewing and acting on them.
// Rendered inside a Shadow DOM so the host page's CSS can't distort it and
// vice-versa. Matches are only ever appended, so browsing/selection stay put
// as new matches stream in.
// ---------------------------------------------------------------------------
let shadow = null;
let matches = [];               // { url, thumb }
let selected = new Set();       // indices into matches
const PREVIEW_MAX = 5;          // thumbnails shown in the slim bar before "+N"

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
const OPEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4"/></svg>';

const FIND_ME_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
  [hidden] { display: none !important; }

  .bar { position: fixed; top: 20px; right: 20px; width: 260px; max-height: 80vh;
    background: #fff; color: #1f2329; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18);
    display: flex; flex-direction: column; overflow: hidden; }
  .bar-head { background: #4285F4; color: #fff; padding: 10px 12px; display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
  .title { flex: 1; }
  .count { background: rgba(255,255,255,.25); border-radius: 10px; padding: 1px 9px; font-size: 12px; min-width: 20px; text-align: center; }
  .x { background: none; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .status { padding: 7px 12px; font-size: 12px; color: #5f6368; border-bottom: 1px solid #eee; }
  .progress { height: 3px; background: #e8eaed; overflow: hidden; position: relative; }
  .progress .fill { position: absolute; top: 0; bottom: 0; width: 42%; background: #4285F4; animation: fmslide 1.1s ease-in-out infinite; }
  @keyframes fmslide { 0% { left: -45%; } 100% { left: 100%; } }
  @media (prefers-reduced-motion: reduce) { .progress .fill { animation: none; left: 0; width: 100%; opacity: .5; } }
  .controls { padding: 8px 10px; }
  .stopbtn { width: 100%; padding: 7px; border-radius: 8px; border: 1px solid #d93025; background: #fff; color: #d93025;
    font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .stopbtn:hover { background: #fce8e6; }
  .preview { padding: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .p-tile, .more { aspect-ratio: 1/1; border-radius: 6px; overflow: hidden; cursor: pointer; }
  .p-tile { background: #f1f3f4; }
  .p-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .more { background: rgba(66,133,244,.12); color: #4285F4; border: 1px dashed #4285F4; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
  .viewall { margin: 2px 10px 10px; padding: 9px; border-radius: 8px; background: #4285F4; color: #fff; border: none; font-weight: 700; font-size: 13px; cursor: pointer; }
  .viewall:hover { background: #3367d6; }

  .overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
  .backdrop { position: absolute; inset: 0; background: rgba(10,12,16,.5); }
  .gallery { position: relative; width: min(900px, 92vw); height: min(80vh, 760px);
    background: #fff; color: #1f2329; border-radius: 12px; box-shadow: 0 18px 44px rgba(0,0,0,.35);
    display: flex; flex-direction: column; overflow: hidden; }
  .g-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #eee; }
  .g-head .title { flex: 0 0 auto; font-weight: 700; font-size: 15px; }
  .live { font-size: 12px; color: #5f6368; }
  .spacer { flex: 1; }
  .link { font-size: 13px; color: #5f6368; background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
  .link:hover { color: #4285F4; }
  .g-grid { padding: 14px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    grid-auto-rows: max-content; gap: 12px; align-content: start; flex: 1 1 0; min-height: 0; }
  .tile { position: relative; aspect-ratio: 4/3; border-radius: 6px; overflow: hidden; background: #f1f3f4; cursor: pointer; }
  .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tile .veil { position: absolute; inset: 0; background: transparent; transition: background .12s; }
  .tile:hover .veil { background: rgba(20,24,33,.18); }
  .tile.fresh { animation: fmpop .28s ease; }
  @keyframes fmpop { from { opacity: 0; } to { opacity: 1; } }
  .check { position: absolute; top: 8px; left: 8px; width: 23px; height: 23px; border-radius: 50%;
    background: rgba(255,255,255,.9); border: 1.5px solid rgba(0,0,0,.28); display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity .12s; color: #fff; }
  .tile:hover .check, .tile.sel .check { opacity: 1; }
  .tile.sel .check { background: #4285F4; border-color: #4285F4; }
  .tile.sel { outline: 3px solid #4285F4; outline-offset: -3px; }
  .check svg { width: 13px; height: 13px; display: none; }
  .tile.sel .check svg { display: block; }
  .open-ico { position: absolute; top: 8px; right: 8px; width: 23px; height: 23px; border-radius: 50%;
    background: rgba(0,0,0,.4); color: #fff; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity .12s; }
  .tile:hover .open-ico { opacity: 1; }
  .open-ico svg { width: 12px; height: 12px; }
  .g-foot { border-top: 1px solid #eee; padding: 11px 14px; display: flex; align-items: center; gap: 10px; }
  .btn { font-size: 13px; font-weight: 700; cursor: pointer; border-radius: 7px; padding: 8px 14px; border: 1px solid transparent; }
  .btn.primary { background: #4285F4; color: #fff; }
  .btn.primary:hover { background: #3367d6; }
  .btn.primary:disabled, .btn.ghost:disabled { opacity: .55; cursor: default; }
  .btn.ghost { background: transparent; color: #4285F4; border-color: #4285F4; }
  .btn.ghost:hover:not(:disabled) { background: rgba(66,133,244,.1); }
`;

const FIND_ME_HTML = `
  <div class="bar">
    <div class="bar-head"><span class="title">Find Me</span><span class="count" id="barCount">0</span><button class="x" id="barClose" title="Close">&times;</button></div>
    <div class="status" id="status">Initializing…</div>
    <div class="progress" id="progress" hidden><div class="fill"></div></div>
    <div class="controls" id="controls" hidden><button class="stopbtn" id="stopBtn">&#9632; Stop scan</button></div>
    <div class="preview" id="preview" hidden></div>
    <button class="viewall" id="viewAll" hidden>View all</button>
  </div>
  <div class="overlay" id="overlay" hidden>
    <div class="backdrop" id="backdrop"></div>
    <div class="gallery">
      <div class="g-head">
        <span class="title">Photos of you</span>
        <span class="live" id="galLive"></span>
        <span class="spacer"></span>
        <button class="link" id="selAll">Select all</button>
        <button class="x" id="galClose" title="Back to bar" style="color:#5f6368;">&times;</button>
      </div>
      <div class="g-grid" id="galGrid"></div>
      <div class="g-foot">
        <span class="live" id="footStatus"></span>
        <span class="spacer"></span>
        <button class="btn ghost" id="dlBtn" disabled>Download all</button>
        <button class="btn primary" id="saveBtn" disabled>Save all to Photos</button>
      </div>
    </div>
  </div>
`;

function fm(sel) { return shadow ? shadow.querySelector(sel) : null; }

function setupUI() {
  if (container) return;
  matches = [];
  selected = new Set();

  container = document.createElement('div');
  container.id = 'find-me-host';
  container.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  shadow = container.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${FIND_ME_CSS}</style>${FIND_ME_HTML}`;
  document.body.appendChild(container);

  fm('#barClose').addEventListener('click', teardownUI);
  fm('#stopBtn').addEventListener('click', stopScan);
  fm('#viewAll').addEventListener('click', openGallery);
  fm('#galClose').addEventListener('click', closeGallery);
  fm('#backdrop').addEventListener('click', closeGallery);
  fm('#selAll').addEventListener('click', toggleSelectAll);
  fm('#dlBtn').addEventListener('click', () => runBulk('download'));
  fm('#saveBtn').addEventListener('click', () => runBulk('save'));
}

function teardownUI() {
  scanAborted = true; // stop any in-progress scan (detection + auto-scroll)
  if (container) container.remove();
  container = null;
  shadow = null;
  matches = [];
  selected = new Set();
}

function updateStatus(text) {
  const el = fm('#status');
  if (el) el.textContent = text;
}

// Show/hide the activity bar and the Stop button together -- they only make
// sense while a scan is actually running.
function setScanning(on) {
  const p = fm('#progress');
  const c = fm('#controls');
  if (p) p.hidden = !on;
  if (c) c.hidden = !on;
}

// Block while the tab is backgrounded. A hidden tab has its timers throttled to
// ~1s and its lazy-load (IntersectionObserver) callbacks suspended, so pressing
// on would crawl and -- with auto-scroll -- falsely reach "complete" having
// loaded nothing new. Pause instead and resume when the user returns.
function waitWhileHidden() {
  if (!document.hidden || scanAborted) return Promise.resolve();
  updateStatus("Paused — switch back to this tab to resume scanning…");
  return new Promise(resolve => {
    const onChange = () => {
      if (!document.hidden || scanAborted) {
        document.removeEventListener('visibilitychange', onChange);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

// Stop the scan but keep the bar and the matches found so far (unlike the ×
// close button, which tears the whole UI down).
function stopScan() {
  scanAborted = true;
  setScanning(false);
  updateStatus(`Scan stopped · ${matches.length} match(es) so far`);
}

function openGallery() { const o = fm('#overlay'); if (o) o.hidden = false; }
function closeGallery() { const o = fm('#overlay'); if (o) o.hidden = true; }

// Append one match to the store, the bar preview, and the gallery grid.
function addMatch(url, thumb) {
  const idx = matches.length;
  matches.push({ url, thumb });
  const n = matches.length;

  fm('#barCount').textContent = String(n);
  fm('#galLive').textContent = `${n} found`;
  const viewAll = fm('#viewAll');
  viewAll.hidden = false;
  viewAll.textContent = `View all ${n} →`;

  // slim bar preview: first PREVIEW_MAX thumbnails, then a growing "+N" tile.
  // Stays hidden until the first match so the bar isn't an empty box mid-scan.
  const preview = fm('#preview');
  preview.hidden = false;
  if (idx < PREVIEW_MAX) {
    const t = document.createElement('div');
    t.className = 'p-tile';
    t.innerHTML = `<img alt="">`;
    t.querySelector('img').src = thumb;
    t.addEventListener('click', openGallery);
    preview.appendChild(t);
  } else {
    let more = fm('#moreCell');
    if (!more) {
      more = document.createElement('div');
      more.id = 'moreCell';
      more.className = 'more';
      more.addEventListener('click', openGallery);
      preview.appendChild(more);
    }
    more.textContent = `+${n - PREVIEW_MAX}`;
  }

  fm('#galGrid').appendChild(createGalleryTile(idx));
  updateActions();
}

function createGalleryTile(idx) {
  const { url, thumb } = matches[idx];
  const tile = document.createElement('div');
  tile.className = 'tile fresh';
  tile.dataset.idx = String(idx);
  tile.innerHTML =
    `<img alt="" loading="lazy">` +
    `<div class="veil"></div>` +
    `<div class="check">${CHECK_SVG}</div>` +
    `<div class="open-ico" title="Open full image">${OPEN_SVG}</div>`;
  tile.querySelector('img').src = thumb;
  tile.addEventListener('animationend', () => tile.classList.remove('fresh'));
  tile.addEventListener('click', (e) => {
    if (e.target.closest('.open-ico')) {   // opening the full image isn't selecting
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (selected.has(idx)) { selected.delete(idx); tile.classList.remove('sel'); }
    else { selected.add(idx); tile.classList.add('sel'); }
    updateActions();
  });
  return tile;
}

function toggleSelectAll() {
  const total = matches.length;
  const selectAll = !(selected.size === total && total > 0);
  selected = new Set();
  fm('#galGrid').querySelectorAll('.tile').forEach((t) => {
    const i = Number(t.dataset.idx);
    if (selectAll) { selected.add(i); t.classList.add('sel'); }
    else { t.classList.remove('sel'); }
  });
  updateActions();
}

// Reflect the current selection on the action buttons (act on the selection, or
// on everything when nothing is picked).
function updateActions() {
  const selAll = fm('#selAll');
  if (!selAll) return;
  const total = matches.length;
  const sel = selected.size;
  selAll.textContent = (sel === total && total > 0) ? 'Clear' : 'Select all';
  const dl = fm('#dlBtn');
  const save = fm('#saveBtn');
  dl.textContent = sel ? `Download (${sel})` : 'Download all';
  save.textContent = sel ? `Save (${sel})` : 'Save all to Photos';
  dl.disabled = save.disabled = total === 0;
}

function selectedUrls() {
  const idxs = selected.size ? [...selected] : matches.map((_, i) => i);
  return idxs.map((i) => matches[i].url);
}

// Download to disk (no account) or Save to Google Photos, in bulk, via the
// background worker (which can fetch cross-origin and, for Save, sign in).
function runBulk(kind) {
  const urls = selectedUrls();
  if (!urls.length) return;
  const foot = fm('#footStatus');
  const dl = fm('#dlBtn');
  const save = fm('#saveBtn');
  dl.disabled = save.disabled = true;

  if (kind === 'download') {
    foot.textContent = `Preparing a zip of ${urls.length} photo(s)…`;
    chrome.runtime.sendMessage({ action: 'downloadImages', urls }, (resp) => {
      updateActions();
      foot.textContent = resp && resp.success
        ? `Downloaded ${resp.count} photo(s) as a zip.`
        : `Download failed: ${resp ? resp.error : 'unknown error'}`;
    });
  } else {
    foot.textContent = `Saving ${urls.length} photo(s) to Google Photos…`;
    chrome.runtime.sendMessage({ action: 'saveImages', urls }, (resp) => {
      updateActions();
      if (resp && resp.success) {
        foot.textContent = resp.failed
          ? `Saved ${resp.saved}, ${resp.failed} failed.`
          : `Saved ${resp.saved} to Google Photos.`;
      } else {
        foot.textContent = `Save failed: ${resp ? resp.error : 'unknown error'}`;
      }
    });
  }
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

  let matched = false;
  for (const detection of detections) {
    const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
    // Smaller distance = closer match. matchThreshold comes from the popup's
    // strictness slider (~0.6 is the model's usual match cutoff).
    if (distance < matchThreshold) {
      const thumbSrc = downscaleToCanvas(fullImg, THUMB_MAX_DIM).toDataURL('image/jpeg', 0.8);
      addMatch(img.currentSrc || img.src, thumbSrc);
      matched = true;
      break; // one match per image
    }
  }
  return matched;
}

// Main scan logic. When autoScroll is set, the page is scrolled progressively
// and newly loaded images are scanned as they appear (streaming), rather than
// waiting for the whole gallery to load first.
async function runScan(referenceImages, autoScroll, threshold) {
  scanAborted = false;
  matchThreshold = (typeof threshold === 'number' && threshold > 0) ? threshold : 0.6;
  setupUI();
  setScanning(true);
  updateStatus("Loading AI Models...");

  const AUTO_SCROLL_STEP = 0.8;      // fraction of viewport height per scroll
  const LAZY_LOAD_WAIT_MS = 600;     // give lazy images time to load after scroll
  const IDLE_PASSES_TO_STOP = 3;     // stop after N bottom passes yield nothing new
  const MAX_SCROLL_PASSES = 1000;    // hard safety cap against runaway pages

  try {
    await loadModels();

    // Always recompute from the photos passed with this scan -- caching across
    // scans would keep matching the first set even after you change your
    // reference photos in the popup.
    updateStatus("Processing reference photos...");
    referenceDescriptor = await computeReferenceDescriptor(referenceImages);

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
        await waitWhileHidden();
        if (scanAborted) break;
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
      while (passes < MAX_SCROLL_PASSES && !scanAborted) {
        passes++;
        await waitWhileHidden(); // don't scroll / judge "at bottom" while hidden
        if (scanAborted) break;
        const found = await scanNewImages();
        if (scanAborted) break;

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

    updateStatus(scanAborted
      ? `Scan stopped · ${scannedCount} images · ${matchCount} match(es)`
      : `Scan complete · ${scannedCount} images · ${matchCount} match(es)`);

  } catch (error) {
    console.error("Scan Error:", error);
    updateStatus(`Error: ${error.message}`);
  } finally {
    setScanning(false); // hide the activity bar + Stop button when the scan ends
  }
}

// Listen for trigger from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startScan') {
    runScan(request.referenceImages, request.autoScroll, request.threshold);
    sendResponse({ started: true });
  }
});
