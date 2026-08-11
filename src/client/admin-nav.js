import { requestCurrentAuthSession } from "./auth-session.mjs";

function getAdminDashboardLinks() {
  return [...document.querySelectorAll("[data-admin-dashboard-link]")];
}

function setAdminDashboardVisible(isVisible) {
  for (const link of getAdminDashboardLinks()) {
    link.classList.toggle("is-hidden", !isVisible);
    link.setAttribute("aria-hidden", String(!isVisible));
  }
}

async function updateAdminDashboardLinks() {
  if (!getAdminDashboardLinks().length) return;
  setAdminDashboardVisible(false);
  try {
    const session = await requestCurrentAuthSession();
    setAdminDashboardVisible(session.ok && session.user?.role === "admin");
  } catch {
    setAdminDashboardVisible(false);
  }
}

updateAdminDashboardLinks();
