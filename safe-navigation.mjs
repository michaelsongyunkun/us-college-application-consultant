let navigationLocked = false;

function isModifiedNavigation(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function resetNavigationState(root = document) {
  navigationLocked = false;
  root.querySelectorAll("[data-safe-nav]").forEach((link) => {
    link.removeAttribute("aria-disabled");
    link.classList.remove("is-loading");
  });
}

export function bindSafeNavigation(root = document) {
  root.querySelectorAll("[data-safe-nav]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (isModifiedNavigation(event)) return;

      const href = link.getAttribute("href");
      if (!href) return;

      event.preventDefault();
      if (navigationLocked) return;

      navigationLocked = true;
      link.setAttribute("aria-disabled", "true");
      link.classList.add("is-loading");

      window.location.href = new URL(href, window.location.href).href;
    });
  });
}

window.addEventListener("pageshow", () => resetNavigationState());
window.addEventListener("focus", () => resetNavigationState());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resetNavigationState();
});

bindSafeNavigation();
