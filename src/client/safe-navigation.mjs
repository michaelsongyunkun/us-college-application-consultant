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

function getCurrentCommandTitle(sidebar) {
  const activeLink = sidebar.querySelector('.command-sidebar-nav a[aria-current="page"]');
  const pageTitle = document.querySelector(".brand-page-identity h1, .logged-in-identity h1");
  return (activeLink?.textContent || pageTitle?.textContent || document.title || "当前页面").trim();
}

function cloneCommandNavigation(sidebar) {
  const originalNav = sidebar.querySelector(".command-sidebar-nav");
  if (!originalNav) return null;

  const nav = originalNav.cloneNode(true);
  nav.setAttribute("aria-label", "移动端功能菜单");
  nav.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  return nav;
}

function closeCommandMobileDrawer(sidebar) {
  const toggle = sidebar.querySelector("[data-command-mobile-toggle]");
  const drawer = sidebar.querySelector("[data-command-mobile-drawer]");
  if (!toggle || !drawer) return;
  toggle.setAttribute("aria-expanded", "false");
  drawer.hidden = true;
  sidebar.classList.remove("is-mobile-nav-open");
}

function setupCommandMobileNavigation(root = document) {
  root.querySelectorAll(".command-sidebar").forEach((sidebar) => {
    if (sidebar.querySelector("[data-command-mobile-shell]")) return;

    const nav = cloneCommandNavigation(sidebar);
    const brand = sidebar.querySelector(".command-sidebar-brand");
    if (!nav || !brand) return;

    const shell = document.createElement("div");
    shell.className = "command-mobile-shell";
    shell.dataset.commandMobileShell = "";

    const title = getCurrentCommandTitle(sidebar);
    const brandClone = brand.cloneNode(true);
    brandClone.classList.add("command-mobile-brand");

    const bar = document.createElement("div");
    bar.className = "command-mobile-bar";

    const pageLabel = document.createElement("span");
    pageLabel.className = "command-mobile-current";
    pageLabel.textContent = title;

    const toggle = document.createElement("button");
    toggle.className = "command-mobile-toggle";
    toggle.type = "button";
    toggle.dataset.commandMobileToggle = "";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "打开功能菜单");
    toggle.innerHTML = '<span aria-hidden="true"></span><strong>菜单</strong>';

    const drawer = document.createElement("div");
    drawer.className = "command-mobile-drawer";
    drawer.dataset.commandMobileDrawer = "";
    drawer.hidden = true;
    drawer.append(nav);

    const note = sidebar.querySelector(".command-sidebar-note");
    if (note) drawer.append(note.cloneNode(true));

    bar.append(brandClone, pageLabel, toggle);
    shell.append(bar, drawer);
    sidebar.prepend(shell);
    sidebar.classList.add("has-mobile-drawer");
    bindSafeNavigation(shell);

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      drawer.hidden = isOpen;
      sidebar.classList.toggle("is-mobile-nav-open", !isOpen);
      toggle.setAttribute("aria-label", isOpen ? "打开功能菜单" : "关闭功能菜单");
    });

    drawer.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) closeCommandMobileDrawer(sidebar);
    });
  });
}

window.addEventListener("pageshow", () => resetNavigationState());
window.addEventListener("focus", () => resetNavigationState());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resetNavigationState();
});
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  document.querySelectorAll(".command-sidebar.is-mobile-nav-open").forEach((sidebar) => {
    if (sidebar.contains(event.target)) return;
    closeCommandMobileDrawer(sidebar);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".command-sidebar.is-mobile-nav-open").forEach(closeCommandMobileDrawer);
});

bindSafeNavigation();
setupCommandMobileNavigation();
