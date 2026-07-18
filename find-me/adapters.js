// adapters.js
//
// Image discovery + URL resolution ("parsing"), split out from the face-api
// scan engine and results UI in content.js. This file knows how to *find*
// image candidates on a page and pick the best URL for each; it knows nothing
// about face detection or the results drawer.
//
// Injected (by popup.js) into the page's isolated world just before content.js,
// so the names defined here (getAdapter, renderedLongestSide, SMALL_THUMB_DIM,
// MIN_CANDIDATE_DIM, …) are visible to content.js at scan time.
//
// The scan engine is source-agnostic: it asks the active adapter for a flat
// list of image *candidates*, then for each one the best full-res URL. Keeping
// discovery and URL resolution behind an adapter is what lets us fit many site
// layouts (plain <img>, CSS background-image, shadow DOM, same-origin iframes)
// and bolt on per-site adapters for thumbnail->original quirks without touching
// the scan/scroll/UI machinery.
//
// A candidate is: { el, kind: 'img'|'bg'|'svg', src }
//   el   -- the DOM element it came from (used to resolve a better URL)
//   src  -- the rendered/natural URL (already-loaded pixels for <img>)

const SMALL_THUMB_DIM = 160;   // px: below this we detect on the resolved full-res
                               // (above it the on-page thumbnail is big enough to
                               // recognize, and fetching the original is wasteful)
const MIN_CANDIDATE_DIM = 64;  // px: ignore icons/sprites smaller than this

const FIND_ME_HOST_ID = 'find-me-host'; // our own results UI -- never scan it

// data-* attributes lazy-load / lightbox libraries commonly stash the full-res
// URL in, roughly best-first.
const FULLRES_DATA_ATTRS = [
  'data-full', 'data-full-src', 'data-original', 'data-original-src',
  'data-hires', 'data-high-res', 'data-large', 'data-large-src',
  'data-src-large', 'data-zoom', 'data-zoom-src', 'data-zoom-image',
  'data-image', 'data-image-src', 'data-src',
];

const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)(\?|#|$)/i;

function looksLikeImageUrl(url) {
  if (!url) return false;
  return url.startsWith('data:image/') || url.startsWith('blob:') || IMAGE_URL_RE.test(url);
}

// Resolve a possibly-relative URL against the element's document base.
function absolutize(url, el) {
  try {
    return new URL(url, (el && el.baseURI) || document.baseURI).href;
  } catch {
    return url;
  }
}

// Pull the first url(...) out of an element's computed background-image, if any.
// Skips gradients and inline SVG data icons (never real photos).
//
// getComputedStyle is the costly part of discovery, and auto-scroll re-walks
// the DOM many times, so memoize the result per element (backgrounds are
// effectively static on the gallery pages this targets).
const bgUrlCache = new WeakMap();
function backgroundUrl(el) {
  if (bgUrlCache.has(el)) return bgUrlCache.get(el);
  let result = null;
  let bg;
  try { bg = getComputedStyle(el).backgroundImage; } catch { bg = null; }
  if (bg && bg !== 'none' && bg.indexOf('url(') !== -1) {
    const m = bg.match(/url\((['"]?)(.*?)\1\)/);
    const url = m && m[2];
    if (url && !url.startsWith('data:image/svg')) result = absolutize(url, el);
  }
  bgUrlCache.set(el, result);
  return result;
}

// Rendered longest side of a candidate, used both to skip tiny icons and to
// decide whether the on-page pixels are big enough to detect on directly.
function renderedLongestSide(cand) {
  if (cand.kind === 'img') {
    const n = Math.max(cand.el.naturalWidth || 0, cand.el.naturalHeight || 0);
    if (n) return n;
  }
  try {
    const r = cand.el.getBoundingClientRect();
    return Math.max(r.width, r.height);
  } catch {
    return 0;
  }
}

// Largest URL from a srcset descriptor list ("url 320w, url 1024w").
function largestFromSrcset(srcset, el) {
  let best = null, bestW = -1;
  for (const part of srcset.split(',')) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    const w = d && d.endsWith('w') ? parseInt(d, 10) : (d && d.endsWith('x') ? parseFloat(d) * 1000 : 0);
    if (w > bestW) { bestW = w; best = u; }
  }
  return best ? absolutize(best, el) : null;
}

// Recursively gather candidates from a document or shadow root. Skips our own
// results UI so we never re-detect the thumbnails we injected.
function walkForCandidates(root, out, seenDocs) {
  let els;
  try { els = root.querySelectorAll('*'); } catch { return; }
  for (const el of els) {
    if (el.id === FIND_ME_HOST_ID) continue; // our shadow host -- don't recurse into our UI

    if (el instanceof HTMLImageElement) {
      const src = el.currentSrc || el.src;
      if (src) out.push({ el, kind: 'img', src });
    } else if (typeof SVGImageElement !== 'undefined' && el instanceof SVGImageElement) {
      const href = (el.href && el.href.baseVal) || el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href) out.push({ el, kind: 'svg', src: absolutize(href, el) });
    } else {
      const bg = backgroundUrl(el);
      if (bg) out.push({ el, kind: 'bg', src: bg });
    }

    if (el.shadowRoot) walkForCandidates(el.shadowRoot, out, seenDocs);

    if (el.tagName === 'IFRAME') {
      let doc = null;
      try { doc = el.contentDocument; } catch { doc = null; } // cross-origin: blocked, skip
      if (doc && !seenDocs.has(doc)) { seenDocs.add(doc); walkForCandidates(doc, out, seenDocs); }
    }
  }
}

// The site-agnostic default: walk the whole DOM (piercing open shadow roots and
// same-origin iframes) collecting every image-bearing node, and resolve the
// best-quality URL from wrapping links / data-* attrs / srcset.
const DefaultAdapter = {
  name: 'default',

  collect() {
    const out = [];
    const seenDocs = new Set();
    walkForCandidates(document, out, seenDocs);
    return out;
  },

  // Best URL to *save* for this candidate. Prefers, in order: a wrapping <a>
  // that points straight at an image file, a full-res data-* attribute, the
  // largest srcset entry, then the rendered src.
  resolveFullRes(cand) {
    const { el, src } = cand;

    const a = el.closest && el.closest('a[href]');
    if (a && a.href && a.href !== src && looksLikeImageUrl(a.href)) return a.href;

    if (el.getAttribute) {
      for (const name of FULLRES_DATA_ATTRS) {
        const v = el.getAttribute(name);
        if (v && looksLikeImageUrl(v)) {
          const abs = absolutize(v, el);
          if (abs !== src) return abs;
        }
      }
    }

    if (el.srcset) {
      const best = largestFromSrcset(el.srcset, el);
      if (best && best !== src) return best;
    }

    return src;
  },
};

// Google Photos renders photos as background-image on <div>s -- DefaultAdapter's
// discovery already finds them -- but it can't upgrade to the original: Google's
// image hosts encode the *delivered* size in the URL as a trailing "=w600-h750-…"
// token (modern) or a "/s64-c-no/" path segment (legacy). Rewriting that token to
// the original ("=s0" / "/s0/") makes "Save" grab the full-resolution file instead
// of the on-screen thumbnail. The rewrite is a no-op on any non-Google URL, so we
// safely fall back to the generic resolver for everything else.
const GOOGLE_IMG_HOST_RE = /(^|\.)(googleusercontent|ggpht)\.com$/i;

function googleOriginalUrl(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return null; }
  if (!GOOGLE_IMG_HOST_RE.test(host)) return null;
  // Modern form: a trailing "=w600-h750-p-k-no" size token (before any ?query).
  if (/=[\w-]+(?=($|\?))/.test(url)) return url.replace(/=[\w-]+(?=($|\?))/, '=s0');
  // Legacy form: an "/s64-c-no/" or "/w600-h400/" size path segment.
  const seg = url.match(/\/((?:s|w)\d+(?:-h\d+)?(?:-[a-z]+)*)\//);
  if (seg) return url.replace(seg[0], '/s0/');
  return url + '=s0';
}

const GoogleAdapter = {
  name: 'google',
  collect() { return DefaultAdapter.collect(); },
  resolveFullRes(cand) {
    const orig = googleOriginalUrl(cand.src);
    if (orig && orig !== cand.src) return orig;
    return DefaultAdapter.resolveFullRes(cand);
  },
};

// Per-site adapters, checked in order; first hostname match wins, else the
// DefaultAdapter. Site data that justifies an entry is gathered separately with
// tools/probe.js, kept out of the shipped extension.
const ADAPTERS = [
  { test: (host) => host === 'photos.google.com', adapter: GoogleAdapter },
];

function getAdapter() {
  const host = location.hostname;
  for (const entry of ADAPTERS) {
    try { if (entry.test(host)) return entry.adapter; } catch { /* keep looking */ }
  }
  return DefaultAdapter;
}
