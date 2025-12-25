if (!window.grammarCheckerInitialized) {
    window.grammarCheckerInitialized = true;

    // Listen for the command from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'checkGrammar') {
        handleGrammarCheck();
      }
    });

    async function handleGrammarCheck() {
      const activeElement = document.activeElement;

      // Basic validation
      if (!activeElement ||
          (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA' && !activeElement.isContentEditable)) {
        alert('Please focus on a text input field first.');
        return;
      }

      // Clear previous overlays
      clearOverlay();

      let text = '';
      if (activeElement.isContentEditable) {
          text = activeElement.innerText;
      } else {
          text = activeElement.value;
      }

      if (!text || text.trim() === '') {
        return; // Nothing to check
      }

      try {
        showLoadingState(activeElement, true);
        const matches = await fetchGrammarErrors(text);
        showLoadingState(activeElement, false);

        if (matches.length === 0) {
            // Optional: show a small toast "No errors found"
            showToast('No errors found', activeElement);
        } else {
            createOverlay(activeElement, matches, text);
        }
      } catch (error) {
        console.error('Grammar check failed:', error);
        showLoadingState(activeElement, false);
        alert('Failed to check grammar. Please try again.');
      }
    }

    async function fetchGrammarErrors(text) {
      const response = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          text: text,
          language: 'auto', // Auto-detect language
          enabledOnly: 'false'
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.matches;
    }

    // UI HELPERS

    function showToast(message, element) {
        const toast = document.createElement('div');
        toast.className = 'grammar-checker-toast';
        toast.textContent = message;

        const rect = element.getBoundingClientRect();
        // Toast is also fixed for consistency
        toast.style.position = 'fixed';
        toast.style.top = `${rect.bottom + 5}px`;
        toast.style.left = `${rect.left}px`;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 2000);
    }

    function showLoadingState(element, isLoading) {
        if (isLoading) {
            element.classList.add('grammar-checker-loading');
        } else {
            element.classList.remove('grammar-checker-loading');
        }
    }

    // --- OVERLAY IMPLEMENTATION ---

    let currentOverlay = null;

    function clearOverlay() {
        if (currentOverlay) {
            currentOverlay.remove();
            currentOverlay = null;

            // Remove global listeners
            window.removeEventListener('scroll', repositionOverlay, true);
            window.removeEventListener('resize', repositionOverlay, true);
        }
        // Remove listeners attached to inputs to clear overlay
        document.querySelectorAll('.grammar-checker-monitored').forEach(el => {
            el.classList.remove('grammar-checker-monitored');
            el.removeEventListener('input', clearOverlay);
            el.removeEventListener('scroll', updateOverlayScroll);
        });
    }

    // Reposition overlay on window scroll/resize
    function repositionOverlay() {
        if (!currentOverlay) return;

        // Find the monitored element
        const input = document.querySelector('.grammar-checker-monitored');
        if (!input) {
            clearOverlay();
            return;
        }

        const rect = input.getBoundingClientRect();

        // Check if input is still visible/on screen (basic check)
        if (rect.width === 0 || rect.height === 0) {
            clearOverlay();
            return;
        }

        currentOverlay.style.top = `${rect.top}px`;
        currentOverlay.style.left = `${rect.left}px`;
        currentOverlay.style.width = `${rect.width}px`;
        currentOverlay.style.height = `${rect.height}px`;
    }

    function createOverlay(input, matches, text) {
        const rect = input.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(input);

        // Create the container that will hold the mirror text
        const overlayContainer = document.createElement('div');
        overlayContainer.className = 'grammar-checker-overlay';

        // Position it using FIXED positioning to avoid document layout issues
        overlayContainer.style.position = 'fixed';
        overlayContainer.style.top = `${rect.top}px`;
        overlayContainer.style.left = `${rect.left}px`;
        overlayContainer.style.width = `${rect.width}px`;
        overlayContainer.style.height = `${rect.height}px`;
        overlayContainer.style.zIndex = '99999';
        overlayContainer.style.pointerEvents = 'none'; // Click through to input
        overlayContainer.style.overflow = 'hidden'; // Match input overflow behavior
        overlayContainer.style.backgroundColor = 'transparent';

        // Create the "Mirror" div
        const mirror = document.createElement('div');
        mirror.className = 'grammar-checker-mirror';

        const stylesToCopy = [
            'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
            'line-height', 'text-align', 'text-transform', 'text-indent',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'border-width', 'box-sizing', 'white-space', 'word-wrap', 'word-break', 'overflow-wrap'
        ];

        stylesToCopy.forEach(prop => {
            mirror.style[prop] = computedStyle.getPropertyValue(prop);
        });

        // Specific adjustments for Input vs Textarea
        if (input.tagName === 'INPUT') {
            mirror.style.whiteSpace = 'pre';
            mirror.style.overflow = 'hidden';
        } else {
            mirror.style.whiteSpace = computedStyle.whiteSpace;
            mirror.style.overflow = 'hidden';
        }

        // IMPORTANT: Mirror content needs to be constructed carefully.
        matches.sort((a, b) => a.offset - b.offset);

        let lastIndex = 0;
        matches.forEach(match => {
            // Text before the error
            const prefix = text.slice(lastIndex, match.offset);
            mirror.appendChild(document.createTextNode(prefix));

            // The error text
            const errorText = text.slice(match.offset, match.offset + match.length);
            const errorSpan = document.createElement('span');
            errorSpan.textContent = errorText;
            errorSpan.className = 'grammar-error-underline';
            errorSpan.dataset.message = match.message;

            // Store replacements in dataset as JSON string
            const replacements = match.replacements.map(r => r.value).slice(0, 5);
            errorSpan.dataset.replacements = JSON.stringify(replacements);
            errorSpan.dataset.offset = match.offset;
            errorSpan.dataset.length = match.length;

            if (match.rule.issueType === 'misspelling' || match.rule.id === 'MORFOLOGIK_RULE_EN_US') {
                 errorSpan.classList.add('error-spelling');
        } else {
             errorSpan.classList.add('error-grammar');
        }

            errorSpan.style.pointerEvents = 'auto';

            errorSpan.addEventListener('mouseenter', showTooltip);
            errorSpan.addEventListener('mouseleave', hideTooltip);
            errorSpan.addEventListener('click', (e) => handleCorrectionClick(e, match, input));

            mirror.appendChild(errorSpan);
            lastIndex = match.offset + match.length;
        });

        // Remaining text
        mirror.appendChild(document.createTextNode(text.slice(lastIndex)));

        overlayContainer.appendChild(mirror);
        document.body.appendChild(overlayContainer);

        currentOverlay = overlayContainer;

        // Sync Scroll (internal input scroll)
        input.classList.add('grammar-checker-monitored');
        input.addEventListener('scroll', updateOverlayScroll);

        // Sync Window Scroll & Resize (page scroll)
        window.addEventListener('scroll', repositionOverlay, true);
        window.addEventListener('resize', repositionOverlay, true);

        // Initial sync
        mirror.scrollTop = input.scrollTop;
        mirror.scrollLeft = input.scrollLeft;

        // Clear on input
        input.addEventListener('input', clearOverlay);
    }

    function updateOverlayScroll(e) {
        if (currentOverlay) {
            const mirror = currentOverlay.firstChild;
            mirror.scrollTop = e.target.scrollTop;
            mirror.scrollLeft = e.target.scrollLeft;
        }
    }

    // --- TOOLTIP IMPLEMENTATION ---

    let tooltip = null;

    function showTooltip(e) {
        if (tooltip) tooltip.remove();

        const span = e.target;
        const message = span.dataset.message;
        const replacements = JSON.parse(span.dataset.replacements || '[]');

        tooltip = document.createElement('div');
        tooltip.className = 'grammar-checker-tooltip';

        const msgDiv = document.createElement('div');
        msgDiv.className = 'gc-message';
        msgDiv.textContent = message;
        tooltip.appendChild(msgDiv);

        if (replacements.length > 0) {
            const suggDiv = document.createElement('div');
            suggDiv.className = 'gc-suggestions';

            replacements.forEach(rep => {
                const btn = document.createElement('button');
                btn.textContent = rep;
                btn.onclick = () => applyCorrection(span, rep);
                suggDiv.appendChild(btn);
            });
            tooltip.appendChild(suggDiv);
        }

        document.body.appendChild(tooltip);

        // Position tooltip
        // Note: rect is relative to viewport because span is inside fixed overlay
        const rect = span.getBoundingClientRect();

        // Tooltip is appended to body, which might be relative or static.
        // If we use fixed for tooltip too, it's easier.
        tooltip.style.position = 'fixed';
        tooltip.style.top = `${rect.bottom + 5}px`;
        tooltip.style.left = `${rect.left}px`;

        // Keep visible on hover
        tooltip.addEventListener('mouseenter', () => {
             // Keep it alive
        });
        tooltip.addEventListener('mouseleave', () => {
            tooltip.remove();
            tooltip = null;
        });
    }

    function hideTooltip(e) {
        // We use a small timeout to allow moving mouse to the tooltip itself
        setTimeout(() => {
            if (tooltip && !tooltip.matches(':hover') && !e.target.matches(':hover')) {
                tooltip.remove();
                tooltip = null;
            }
        }, 100);
    }

    function handleCorrectionClick(e, match, input) {
        // Optional
    }

    function applyCorrection(span, replacement) {
        const input = document.querySelector('.grammar-checker-monitored');
        if (!input) return;

        const offset = parseInt(span.dataset.offset, 10);
        const length = parseInt(span.dataset.length, 10);

        if (isNaN(offset) || isNaN(length)) return;

        if (typeof input.setRangeText === 'function') {
            input.setRangeText(replacement, offset, offset + length, 'select');
            input.dispatchEvent(new Event('input', { bubbles: true }));

            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
        } else {
            console.warn('setRangeText not supported on this element');
        }
    }
}
