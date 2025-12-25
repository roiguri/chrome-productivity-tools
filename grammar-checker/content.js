let currentOverlay = null;
let activeElementRef = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "check_grammar") {
    // We only process if this frame has focus or contains the active element
    // However, activeElement check inside iframe is tricky.
    // If the iframe is active, document.activeElement will be the body or the input inside it.
    if (document.hasFocus() || document.activeElement.tagName === 'IFRAME') {
        checkGrammar();
    }
  }
});

function getActiveInput() {
    let el = document.activeElement;

    // Dive into shadow roots if necessary (though rare for main inputs, common in web components)
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }

    const tagName = el.tagName.toLowerCase();
    const isContentEditable = el.isContentEditable;
    const isInput = tagName === 'input' && (el.type === 'text' || el.type === 'email' || el.type === 'search' || !el.type);
    const isTextarea = tagName === 'textarea';

    if (isInput || isTextarea || isContentEditable) {
        return { element: el, type: isContentEditable ? 'contenteditable' : tagName };
    }
    return null;
}

async function checkGrammar() {
    const activeObj = getActiveInput();
    if (!activeObj) {
        console.log("Grammar Checker: No supported input field focused.");
        return;
    }

    const { element, type } = activeObj;
    activeElementRef = element;

    // Remove existing overlay if any
    removeOverlay();

    // Get Text
    let text = "";
    if (type === 'input' || type === 'textarea') {
        text = element.value;
    } else {
        // ContentEditable: best effort text extraction
        text = element.innerText || element.textContent;
    }

    if (!text || text.trim().length === 0) return;

    // Send to Background for API check
    const response = await chrome.runtime.sendMessage({ action: "check_text_api", text });

    if (response && response.success) {
        showErrors(element, type, text, response.data);
    } else {
        console.error("Grammar Checker API Error:", response.error);
    }
}

function showErrors(element, type, text, data) {
    if (!data.matches || data.matches.length === 0) return;

    // Create Overlay Container
    const overlay = document.createElement('div');
    overlay.className = 'grammar-checker-overlay';
    document.body.appendChild(overlay);
    currentOverlay = overlay;

    // Position Overlay exactly over the input
    updateOverlayPosition(overlay, element);

    // Add resize/scroll listeners to update position
    const updatePos = () => updateOverlayPosition(overlay, element);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true); // Capture phase for all scrolling parents

    // Clean up listeners when overlay is removed
    overlay.cleanup = () => {
        window.removeEventListener('resize', updatePos);
        window.removeEventListener('scroll', updatePos, true);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    // Calculate coordinates and draw underlines
    // This is the tricky part: mapping string offsets to pixel coordinates.
    // Approach: Create a mirror element with identical styling, hide it,
    // and wrap the error words in spans to get their positions.

    const mirror = document.createElement('div');
    const style = window.getComputedStyle(element);

    // Copy relevant styles
    const stylesToCopy = [
        'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
        'line-height', 'text-align', 'padding-top', 'padding-bottom',
        'padding-left', 'padding-right', 'border-width', 'box-sizing',
        'white-space', 'word-wrap', 'overflow-wrap'
    ];

    stylesToCopy.forEach(prop => {
        mirror.style[prop] = style.getPropertyValue(prop);
    });

    // Specific adjustments
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap'; // Important for matching textarea wrapping
    if (type === 'input') mirror.style.whiteSpace = 'pre'; // Inputs usually don't wrap

    // Match dimensions
    const rect = element.getBoundingClientRect();
    mirror.style.width = `${rect.width}px`;
    mirror.style.height = `${rect.height}px`; // Unused if we just measure spans, but good for context

    document.body.appendChild(mirror);

    // Build mirror content with spans for errors
    // Sort matches by offset to process sequentially
    const matches = data.matches.sort((a, b) => a.offset - b.offset);

    let lastIndex = 0;
    matches.forEach(match => {
        // Text before error
        mirror.appendChild(document.createTextNode(text.substring(lastIndex, match.offset)));

        // Error text
        const span = document.createElement('span');
        span.textContent = text.substring(match.offset, match.offset + match.length);
        mirror.appendChild(span);

        // Store reference to span in match object for measurement
        match.spanElement = span;

        lastIndex = match.offset + match.length;
    });
    // Remaining text
    mirror.appendChild(document.createTextNode(text.substring(lastIndex)));

    // Now measure and create underlines in the real overlay
    matches.forEach(match => {
        const spanRect = match.spanElement.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        // Calculate relative position within the element
        // Note: The mirror is appended to body, so spanRect is global (viewport).
        // However, we need to account for the fact that the 'mirror' might not be perfectly aligned with 'element' in the DOM flow.
        // Actually, we can just use the difference between the mirror's bounding box and the span's bounding box?
        // Wait, the mirror is hidden but layout is computed.
        // Let's position the mirror exactly at top-left 0,0 of viewport for measurement?
        // Or just trust the relative offsets?

        // Better: Position mirror exactly where the input is.
        mirror.style.top = `${rect.top + window.scrollY}px`;
        mirror.style.left = `${rect.left + window.scrollX}px`;

        // Refetch span rect after positioning mirror
        const freshSpanRect = match.spanElement.getBoundingClientRect();

        const underline = document.createElement('div');
        underline.className = `grammar-error-underline ${match.rule.issueType === 'misspelling' ? 'grammar-error-spelling' : 'grammar-error-grammar'}`;

        // Position relative to the overlay (which is over the input)
        // Overlay is fixed/absolute at element's position.
        // Let's make overlay standard absolute at body level to match mirror logic?

        // Actually, let's keep it simple: Use global coordinates for everything (position: absolute on body).
        underline.style.left = `${freshSpanRect.left + window.scrollX}px`;
        underline.style.top = `${freshSpanRect.bottom + window.scrollY - 2}px`; // Just at the bottom of text
        underline.style.width = `${freshSpanRect.width}px`;
        underline.style.height = '2px';

        underline.addEventListener('click', (e) => {
            e.stopPropagation();
            showTooltip(match, freshSpanRect.left, freshSpanRect.bottom + 5);
        });

        overlay.appendChild(underline);
    });

    document.body.removeChild(mirror);
}

function updateOverlayPosition(overlay, element) {
    // If element is gone, remove overlay
    if (!document.contains(element)) {
        removeOverlay();
        return;
    }
    // We don't really need to move the container if we used global coordinates for children,
    // BUT if the page scrolls, the absolute coordinates (if relative to document) might be fine.
    // However, fixed elements (like toolbars) complicate this.
    // For now, assume global absolute coordinates work for standard scrolling pages.
}

function removeOverlay() {
    if (currentOverlay) {
        if (currentOverlay.cleanup) currentOverlay.cleanup();
        else if (currentOverlay.parentNode) currentOverlay.parentNode.removeChild(currentOverlay);
        currentOverlay = null;
    }
    // Also remove any tooltips
    const tooltips = document.querySelectorAll('.grammar-checker-tooltip');
    tooltips.forEach(t => t.remove());
}

function showTooltip(match, x, y) {
    // Remove existing
    const existing = document.querySelectorAll('.grammar-checker-tooltip');
    existing.forEach(t => t.remove());

    const tooltip = document.createElement('div');
    tooltip.className = 'grammar-checker-tooltip';
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y + window.scrollY}px`;

    const msg = document.createElement('div');
    msg.className = 'grammar-checker-message';
    msg.textContent = match.message;
    tooltip.appendChild(msg);

    match.replacements.slice(0, 5).forEach(rep => {
        const opt = document.createElement('div');
        opt.className = 'grammar-checker-option';
        opt.textContent = rep.value;
        opt.onclick = () => applyCorrection(match, rep.value);
        tooltip.appendChild(opt);
    });

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', closeTooltip);
    }, 0);

    function closeTooltip(e) {
        if (!tooltip.contains(e.target)) {
            tooltip.remove();
            document.removeEventListener('click', closeTooltip);
        }
    }

    document.body.appendChild(tooltip);
}

function applyCorrection(match, replacement) {
    if (!activeElementRef) return;

    const el = activeElementRef;
    const originalText = el.value || el.innerText || el.textContent;

    // Simple string replacement based on offset
    // Note: This is fragile if text changed since check.
    // Ideally we re-verify, but for MVP:
    const newText = originalText.substring(0, match.offset) + replacement + originalText.substring(match.offset + match.length);

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = newText;
        // Dispatch event
        el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.isContentEditable) {
        // Try to preserve focus and use execCommand if possible, or direct text replacement
        el.focus();
        // This resets cursor, which is annoying but functional
        el.innerText = newText;
    }

    removeOverlay(); // Clear marks as they are now invalid
}
