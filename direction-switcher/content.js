let isPickerActive = false;
let badgeElement = null;

const HIGHLIGHT_STYLE = `
  outline: 2px solid #4285F4 !important;
  cursor: crosshair !important;
  box-shadow: 0 0 10px rgba(66, 133, 244, 0.5) !important;
`;

const BADGE_ID = "direction-switcher-badge";

function createBadge() {
  if (document.getElementById(BADGE_ID)) return;

  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.innerText = "Direction Picker Active (Alt+R to exit)";
  badge.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #4285F4;
    color: white;
    padding: 10px 16px;
    border-radius: 8px;
    font-family: sans-serif;
    font-size: 14px;
    font-weight: bold;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    pointer-events: none;
    transition: opacity 0.3s;
  `;
  document.body.appendChild(badge);
  badgeElement = badge;
}

function removeBadge() {
  if (badgeElement) {
    badgeElement.remove();
    badgeElement = null;
  }
}

function handleMouseOver(event) {
  if (!isPickerActive) return;
  // Don't highlight the badge itself (it's pointer-events: none, but safety check)
  if (event.target.id === BADGE_ID) return;

  event.target.classList.add("direction-switcher-highlight");
}

function handleMouseOut(event) {
  if (!isPickerActive) return;
  event.target.classList.remove("direction-switcher-highlight");
}

function handleClick(event) {
  if (!isPickerActive) return;

  event.preventDefault();
  event.stopPropagation();

  const target = event.target;
  const computedStyle = window.getComputedStyle(target);
  const currentDir = computedStyle.direction;

  const newDir = currentDir === "rtl" ? "ltr" : "rtl";
  target.style.setProperty("direction", newDir, "important");

  // Visual feedback (flash the element)
  const originalTransition = target.style.transition;
  target.style.transition = "background-color 0.2s";
  const originalBg = target.style.backgroundColor;
  target.style.backgroundColor = "rgba(66, 133, 244, 0.2)";

  setTimeout(() => {
    target.style.backgroundColor = originalBg;
    setTimeout(() => {
        target.style.transition = originalTransition;
    }, 200);
  }, 200);
}

function handleKeyDown(event) {
  if (!isPickerActive) return;
  if (event.key === "Escape") {
    deactivatePicker();
  }
}

function injectStyles() {
  const styleId = "direction-switcher-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .direction-switcher-highlight {
        ${HIGHLIGHT_STYLE}
      }
    `;
    document.head.appendChild(style);
  }
}

function activatePicker() {
  if (isPickerActive) return;
  isPickerActive = true;
  injectStyles();
  createBadge();

  document.addEventListener("mouseover", handleMouseOver, true);
  document.addEventListener("mouseout", handleMouseOut, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
}

function deactivatePicker() {
  if (!isPickerActive) return;
  isPickerActive = false;
  removeBadge();

  // Cleanup current highlight
  const highlighted = document.querySelectorAll(".direction-switcher-highlight");
  highlighted.forEach(el => el.classList.remove("direction-switcher-highlight"));

  document.removeEventListener("mouseover", handleMouseOver, true);
  document.removeEventListener("mouseout", handleMouseOut, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "togglePicker") {
    if (isPickerActive) {
      deactivatePicker();
    } else {
      activatePicker();
    }
  }
});
