// Find Me — DOM image probe (standalone dev tool, NOT shipped in the extension)
//
// Purpose: gather ground-truth data on how a given site exposes its photos, so
// we can tell where the extension's DefaultAdapter (generic discovery + full-res
// resolution) already suffices vs. where a site needs a bespoke adapter.
//
// This file is never referenced by manifest.json and never runs for users. It
// deliberately mirrors the discovery/resolution logic in content.js so what it
// measures matches what the extension actually does.
//
// How to use:
//   1. Open the target site (a gallery / search results / social feed).
//   2. Open DevTools → Console.
//   3. Paste the entire contents of this file and press Enter.
//   4. Read the printed report; window.__findMeProbe holds the raw result for
//      copy-paste into notes.
//
// It reads the DOM only — it fetches nothing and uploads nothing.

(() => {
  const SMALL_THUMB_DIM = 256;
  const MIN_CANDIDATE_DIM = 64;
  const FULLRES_DATA_ATTRS = [
    'data-full', 'data-full-src', 'data-original', 'data-original-src',
    'data-hires', 'data-high-res', 'data-large', 'data-large-src',
    'data-src-large', 'data-zoom', 'data-zoom-src', 'data-zoom-image',
    'data-image', 'data-image-src', 'data-src',
  ];
  const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)(\?|#|$)/i;

  const looksLikeImageUrl = (url) =>
    !!url && (url.startsWith('data:image/') || url.startsWith('blob:') || IMAGE_URL_RE.test(url));

  const absolutize = (url, el) => {
    try { return new URL(url, (el && el.baseURI) || document.baseURI).href; }
    catch { return url; }
  };

  function backgroundUrl(el) {
    let bg;
    try { bg = getComputedStyle(el).backgroundImage; } catch { return null; }
    if (!bg || bg === 'none' || bg.indexOf('url(') === -1) return null;
    const m = bg.match(/url\((['"]?)(.*?)\1\)/);
    const url = m && m[2];
    if (!url || url.startsWith('data:image/svg')) return null;
    return absolutize(url, el);
  }

  function renderedLongestSide(cand) {
    if (cand.kind === 'img') {
      const n = Math.max(cand.el.naturalWidth || 0, cand.el.naturalHeight || 0);
      if (n) return n;
    }
    try { const r = cand.el.getBoundingClientRect(); return Math.max(r.width, r.height); }
    catch { return 0; }
  }

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

  // Mirror of DefaultAdapter.resolveFullRes, but also reports WHICH rule fired
  // so we can see how each site is being resolved.
  function resolveFullRes(cand) {
    const { el, src } = cand;
    const a = el.closest && el.closest('a[href]');
    if (a && a.href && a.href !== src && looksLikeImageUrl(a.href)) return { url: a.href, via: 'anchor' };
    if (el.getAttribute) {
      for (const name of FULLRES_DATA_ATTRS) {
        const v = el.getAttribute(name);
        if (v && looksLikeImageUrl(v)) {
          const abs = absolutize(v, el);
          if (abs !== src) return { url: abs, via: name };
        }
      }
    }
    if (el.srcset) {
      const best = largestFromSrcset(el.srcset, el);
      if (best && best !== src) return { url: best, via: 'srcset' };
    }
    return { url: src, via: 'rendered' };
  }

  const stats = { shadowRoots: 0, sameOriginFrames: 0, crossOriginFrames: 0 };

  function walk(root, out, seenDocs) {
    let els;
    try { els = root.querySelectorAll('*'); } catch { return; }
    for (const el of els) {
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

      if (el.shadowRoot) { stats.shadowRoots++; walk(el.shadowRoot, out, seenDocs); }

      if (el.tagName === 'IFRAME') {
        let doc = null;
        try { doc = el.contentDocument; } catch { doc = null; }
        if (doc) {
          stats.sameOriginFrames++;
          if (!seenDocs.has(doc)) { seenDocs.add(doc); walk(doc, out, seenDocs); }
        } else {
          stats.crossOriginFrames++;
        }
      }
    }
  }

  const candidates = [];
  walk(document, candidates, new Set());

  // How many candidates would actually be scanned (pass the size gate).
  const scannable = candidates.filter((c) =>
    c.kind === 'img'
      ? (c.el.naturalWidth > 50 && c.el.naturalHeight > 50)
      : renderedLongestSide(c) >= MIN_CANDIDATE_DIM);

  const byKind = (arr) => arr.reduce((a, c) => (a[c.kind] = (a[c.kind] || 0) + 1, a), {});

  // Resolution breakdown: for scannable candidates, which rule produced the
  // full-res URL, and how often it differs from what the browser rendered
  // (i.e. how often full-res resolution actually buys us something).
  const viaCounts = {};
  let upgraded = 0, tinyThumbs = 0;
  const samples = [];
  for (const c of scannable) {
    const r = resolveFullRes(c);
    viaCounts[r.via] = (viaCounts[r.via] || 0) + 1;
    const differs = r.url !== c.src;
    if (differs) upgraded++;
    const rendered = renderedLongestSide(c);
    if (rendered && rendered < SMALL_THUMB_DIM) tinyThumbs++;
    if (samples.length < 15 && differs) {
      samples.push({ kind: c.kind, via: r.via, rendered: Math.round(rendered), thumb: c.src, fullRes: r.url });
    }
  }

  const naked = document.querySelectorAll('img').length; // what the OLD scanner saw

  const report = {
    site: location.hostname,
    url: location.href,
    domImgTags: naked,
    candidatesFound: candidates.length,
    candidatesByKind: byKind(candidates),
    scannable: scannable.length,
    scannableByKind: byKind(scannable),
    hiddenFromOldScanner: {
      // candidates the previous querySelectorAll('img') scanner could not see
      backgroundImages: byKind(scannable).bg || 0,
      svgImages: byKind(scannable).svg || 0,
      shadowRoots: stats.shadowRoots,
      sameOriginFrames: stats.sameOriginFrames,
      crossOriginFrames: stats.crossOriginFrames,
    },
    fullResResolution: {
      ruleFired: viaCounts,
      upgradedFromRendered: upgraded,
      renderedSmallerThanThumbDim: tinyThumbs,
    },
    samples,
  };

  window.__findMeProbe = report;

  console.log('%c[Find Me] DOM image probe — ' + report.site, 'font-weight:bold;font-size:13px;color:#4285F4');
  console.log('img tags (old scanner)      :', report.domImgTags);
  console.log('candidates (new discovery)  :', report.candidatesFound, report.candidatesByKind);
  console.log('scannable (pass size gate)  :', report.scannable, report.scannableByKind);
  console.log('hidden from old scanner     :', report.hiddenFromOldScanner);
  console.log('full-res resolution         :', report.fullResResolution);
  if (samples.length) {
    console.log('sample thumb → full-res pairs:');
    console.table(samples);
  } else {
    console.log('sample thumb → full-res pairs: (none — rendered URL was already best everywhere)');
  }
  console.log('%cRaw report saved to window.__findMeProbe', 'color:#5f6368');

  return report;
})();
