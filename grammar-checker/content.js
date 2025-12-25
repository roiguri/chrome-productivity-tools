if (!window.grammarCheckerInitialized) {
    window.grammarCheckerInitialized = true;

    // Track applied corrections to adjust offsets dynamically
    let appliedCorrections = [];

    // Robust listener attachment
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'checkGrammar') {
                if (document.hasFocus()) {
                    handleGrammarCheck();
                }
            }
        });
    } catch (e) {
        console.warn('Grammar Checker: Failed to attach listener', e);
    }

    async function handleGrammarCheck() {
        const activeElement = document.activeElement;

        // Google Docs Check
        if (window.location.hostname.includes('docs.google.com')) {
            showToast('Grammar Checker: Google Docs is not supported (use native tools).', document.body);
            return;
        }

        if (!activeElement ||
            (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA' && !activeElement.isContentEditable)) {
            alert('Please focus on a text input field first.');
            return;
        }

        // Close any existing panel and reset state
        closePanel();

        let text = '';
        if (activeElement.isContentEditable) {
            text = activeElement.innerText;
        } else {
            text = activeElement.value;
        }

        if (!text || text.trim() === '') {
            return;
        }

        try {
            showLoadingState(activeElement, true);
            const matches = await fetchGrammarErrors(text);
            showLoadingState(activeElement, false);

            if (matches.length === 0) {
                showToast('No errors found', activeElement);
            } else {
                createErrorPanel(activeElement, matches, text);
            }
        } catch (error) {
            console.error('Grammar check failed:', error);
            showLoadingState(activeElement, false);
            alert('Failed to check grammar. Please try again.');
        }
    }

    async function fetchGrammarErrors(text) {
        if (!chrome.runtime || !chrome.runtime.id) {
             throw new Error("Extension context invalidated");
        }

        const response = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                text: text,
                language: 'auto',
                enabledOnly: 'false'
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.matches;
    }

    // --- PANEL IMPLEMENTATION ---

    function createErrorPanel(input, matches, text) {
        appliedCorrections = []; // Reset tracking for this session

        const panel = document.createElement('div');
        panel.className = 'grammar-checker-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'gc-panel-header';
        header.innerHTML = `
            <span>Found ${matches.length} issue${matches.length === 1 ? '' : 's'}</span>
            <button class="gc-close-btn">&times;</button>
        `;
        panel.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.className = 'gc-panel-content';

        matches.forEach(match => {
            const item = document.createElement('div');
            item.className = 'gc-panel-item';

            // Original Text Context
            const errorText = text.substring(match.offset, match.offset + match.length);

            const itemHeader = document.createElement('div');
            itemHeader.className = 'gc-item-header';

            const label = document.createElement('span');
            label.className = 'gc-error-label';
            label.textContent = errorText;
            if (match.rule.issueType === 'misspelling') label.classList.add('gc-label-spelling');
            else label.classList.add('gc-label-grammar');

            itemHeader.appendChild(label);
            itemHeader.appendChild(document.createTextNode(': ' + match.message));
            item.appendChild(itemHeader);

            // Suggestions
            if (match.replacements && match.replacements.length > 0) {
                const actions = document.createElement('div');
                actions.className = 'gc-actions';

                // Show top 3 suggestions
                match.replacements.slice(0, 3).forEach(rep => {
                    const btn = document.createElement('button');
                    btn.className = 'gc-fix-btn';
                    btn.textContent = rep.value;
                    btn.onclick = () => {
                        applyCorrection(input, match, rep.value);
                        // Remove this item from list after fix
                        item.remove();
                        // Update header count?
                        const remaining = content.querySelectorAll('.gc-panel-item').length;
                        if (remaining === 0) {
                            closePanel();
                            showToast("All fixed!", input);
                        } else {
                            header.querySelector('span').textContent = `Found ${remaining} issue${remaining === 1 ? '' : 's'}`;
                        }
                    };
                    actions.appendChild(btn);
                });
                item.appendChild(actions);
            }

            content.appendChild(item);
        });

        panel.appendChild(content);
        document.body.appendChild(panel);

        // Close logic
        header.querySelector('.gc-close-btn').onclick = closePanel;

        // Mark input
        input.classList.add('grammar-checker-highlight');

        // Auto-close on input (stale results)
        input.addEventListener('input', closePanel);
    }

    function closePanel() {
        const panel = document.querySelector('.grammar-checker-panel');
        if (panel) panel.remove();

        document.querySelectorAll('.grammar-checker-highlight').forEach(el => {
            el.classList.remove('grammar-checker-highlight');
            // Clean up listener to prevent leaks
            el.removeEventListener('input', closePanel);
        });

        appliedCorrections = [];
    }

    function getAdjustedOffset(originalOffset) {
        let shift = 0;
        for (const correction of appliedCorrections) {
            if (correction.originalOffset < originalOffset) {
                shift += correction.lengthDiff;
            }
        }
        return originalOffset + shift;
    }

    function applyCorrection(input, match, replacement) {
        const adjustedOffset = getAdjustedOffset(match.offset);

        // Handle INPUT/TEXTAREA
        if (typeof input.setRangeText === 'function') {
            try {
                input.setRangeText(replacement, adjustedOffset, adjustedOffset + match.length, 'select');
                input.dispatchEvent(new Event('input', { bubbles: true }));

                const diff = replacement.length - match.length;
                appliedCorrections.push({
                    originalOffset: match.offset,
                    lengthDiff: diff
                });
            } catch (e) {
                console.error("Failed to set range text", e);
                showToast("Failed to apply fix", input);
            }
            return;
        }

        // Handle ContentEditable (Basic Support)
        if (input.isContentEditable) {
            if (input.childNodes.length === 1 && input.childNodes[0].nodeType === 3) {
                 const textNode = input.childNodes[0];
                 const fullText = textNode.nodeValue;

                 const before = fullText.substring(0, adjustedOffset);
                 const after = fullText.substring(adjustedOffset + match.length);
                 textNode.nodeValue = before + replacement + after;

                 input.dispatchEvent(new Event('input', { bubbles: true }));

                 const diff = replacement.length - match.length;
                 appliedCorrections.push({
                    originalOffset: match.offset,
                    lengthDiff: diff
                 });

            } else {
                showToast("Cannot auto-fix rich text. Please edit manually.", input);
            }
            return;
        }

        console.warn("Manual replacement not supported on this element type.");
    }


    // UI HELPERS
    function showToast(message, element) {
        const toast = document.createElement('div');
        toast.className = 'grammar-checker-toast';
        toast.textContent = message;

        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function showLoadingState(element, isLoading) {
        if (isLoading) {
            element.classList.add('grammar-checker-loading');
        } else {
            element.classList.remove('grammar-checker-loading');
        }
    }
}
