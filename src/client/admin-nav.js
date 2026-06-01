const adminDashboardLinks = [...document.querySelectorAll("[data-admin-dashboard-link]")];

function setAdminDashboardVisible(isVisible) {
  for (const link of adminDashboardLinks) {
    link.classList.toggle("is-hidden", !isVisible);
    link.setAttribute("aria-hidden", String(!isVisible));
  }
}

async function updateAdminDashboardLinks() {
  if (!adminDashboardLinks.length) return;
  setAdminDashboardVisible(false);
  try {
    const response = await fetch("/api/auth/me", { method: "GET" });
    const data = await response.json().catch(() => ({}));
    setAdminDashboardVisible(response.ok && data.user?.role === "admin");
  } catch {
    setAdminDashboardVisible(false);
  }
}

updateAdminDashboardLinks();
