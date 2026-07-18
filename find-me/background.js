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

// Fetch a cross-origin image and return it as a data URL. This runs in the
// service worker, which -- unlike a content script -- can fetch across origins
// under the extension's <all_urls> host permission, bypassing the page's CORS
// policy. FileReader isn't available in service workers, so base64-encode the
// bytes manually.
async function fetchImageAsDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());

  let binary = '';
  const chunkSize = 0x8000; // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  const type = blob.type || 'image/jpeg';
  return `data:${type};base64,${btoa(binary)}`;
}

// Upload a single image to Google Photos by URL. Fetching here (in the worker)
// bypasses the page's CORS policy under <all_urls>, and we upload the original
// bytes unchanged -- no re-encoding -- so quality is preserved.
async function uploadImage(url, fileName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
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

// Derive a reasonable download filename from an image URL.
function filenameFor(url) {
  try {
    const base = new URL(url).pathname.split('/').pop() || 'image';
    return /\.(jpe?g|png|webp|gif|bmp)$/i.test(base) ? base : base + '.jpg';
  } catch (e) {
    return 'image.jpg';
  }
}

// --- Minimal ZIP writer (STORE / no compression) --------------------------
// Images are already compressed, so storing them uncompressed is fine and
// avoids bundling a deflate library.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  const enc = new TextEncoder();
  const files = entries.map(e => ({ name: enc.encode(e.name), data: e.bytes, crc: crc32(e.bytes) }));

  let size = 22; // end-of-central-directory record
  for (const f of files) size += 30 + f.name.length + f.data.length + 46 + f.name.length;

  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let off = 0;
  const localOffsets = [];

  for (const f of files) {
    localOffsets.push(off);
    dv.setUint32(off, 0x04034b50, true); off += 4;   // local file header
    dv.setUint16(off, 20, true); off += 2;            // version needed
    dv.setUint16(off, 0, true); off += 2;             // flags
    dv.setUint16(off, 0, true); off += 2;             // method: store
    dv.setUint16(off, 0, true); off += 2;             // mod time
    dv.setUint16(off, 0x21, true); off += 2;          // mod date (1980-01-01)
    dv.setUint32(off, f.crc, true); off += 4;
    dv.setUint32(off, f.data.length, true); off += 4; // compressed size
    dv.setUint32(off, f.data.length, true); off += 4; // uncompressed size
    dv.setUint16(off, f.name.length, true); off += 2;
    dv.setUint16(off, 0, true); off += 2;             // extra length
    out.set(f.name, off); off += f.name.length;
    out.set(f.data, off); off += f.data.length;
  }

  const cdStart = off;
  files.forEach((f, i) => {
    dv.setUint32(off, 0x02014b50, true); off += 4;    // central directory header
    dv.setUint16(off, 20, true); off += 2;            // version made by
    dv.setUint16(off, 20, true); off += 2;            // version needed
    dv.setUint16(off, 0, true); off += 2;             // flags
    dv.setUint16(off, 0, true); off += 2;             // method
    dv.setUint16(off, 0, true); off += 2;             // mod time
    dv.setUint16(off, 0x21, true); off += 2;          // mod date
    dv.setUint32(off, f.crc, true); off += 4;
    dv.setUint32(off, f.data.length, true); off += 4;
    dv.setUint32(off, f.data.length, true); off += 4;
    dv.setUint16(off, f.name.length, true); off += 2;
    dv.setUint16(off, 0, true); off += 2;             // extra length
    dv.setUint16(off, 0, true); off += 2;             // comment length
    dv.setUint16(off, 0, true); off += 2;             // disk number start
    dv.setUint16(off, 0, true); off += 2;             // internal attrs
    dv.setUint32(off, 0, true); off += 4;             // external attrs
    dv.setUint32(off, localOffsets[i], true); off += 4; // local header offset
    out.set(f.name, off); off += f.name.length;
  });

  const cdSize = off - cdStart;
  dv.setUint32(off, 0x06054b50, true); off += 4;      // end of central directory
  dv.setUint16(off, 0, true); off += 2;
  dv.setUint16(off, 0, true); off += 2;
  dv.setUint16(off, files.length, true); off += 2;
  dv.setUint16(off, files.length, true); off += 2;
  dv.setUint32(off, cdSize, true); off += 4;
  dv.setUint32(off, cdStart, true); off += 4;
  dv.setUint16(off, 0, true); off += 2;               // comment length
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// Local timestamp like 2026-07-18_143205 for unique download names.
function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Download the selected images as a single ZIP. Fetching here (in the worker)
// bypasses the page's CORS policy under <all_urls>.
async function downloadImages(urls) {
  const entries = [];
  const usedNames = new Set();
  for (const url of urls) {
    try {
      const bytes = await fetchBytes(url);
      // Ensure unique names inside the archive.
      let name = filenameFor(url);
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let i = 1;
      while (usedNames.has(name)) name = `${stem}-${i++}${ext}`;
      usedNames.add(name);
      entries.push({ name, bytes });
    } catch (e) {
      console.error('[Find Me] zip fetch failed:', url, e);
    }
  }
  if (!entries.length) throw new Error('None of the images could be fetched');

  const zip = buildZip(entries);
  const dataUrl = 'data:application/zip;base64,' + bytesToBase64(zip);

  await new Promise((resolve, reject) => {
    chrome.downloads.download({ url: dataUrl, filename: `find-me-photos_${timestamp()}.zip` }, (id) => {
      if (chrome.runtime.lastError || id === undefined) {
        reject(chrome.runtime.lastError || new Error('download failed'));
      } else {
        resolve(id);
      }
    });
  });
  return entries.length;
}

// Save many images to Google Photos. Signs in interactively once (prompts only
// if needed), then uploads each; returns how many succeeded/failed.
async function saveImages(urls) {
  await getAuthToken(true); // interactive: surfaces the consent screen if not signed in
  let saved = 0, failed = 0;
  for (const url of urls) {
    try {
      await uploadImage(url, filenameFor(url));
      saved++;
    } catch (e) {
      console.error('[Find Me] save failed:', url, e);
      failed++;
    }
  }
  return { saved, failed };
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

  if (request.action === "fetchImage") {
    fetchImageAsDataUrl(request.url)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(error => {
        console.error('[Find Me] fetchImage failed:', request.url, error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "downloadImages") {
    downloadImages(request.urls)
      .then(count => sendResponse({ success: true, count }))
      .catch(error => {
        console.error('[Find Me] downloadImages failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "saveImages") {
    saveImages(request.urls)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => {
        console.error('[Find Me] saveImages failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
