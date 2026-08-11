let currentAuthSession = null;
let currentAuthSessionPromise = null;

function buildAuthSession(response, data = {}) {
  const user = response.ok ? data.user || null : null;
  return {
    ok: response.ok && Boolean(user),
    user,
    data,
    csrfToken: data.csrfToken || "",
  };
}

export async function requestCurrentAuthSession({ fetcher = fetch, force = false } = {}) {
  if (!force && currentAuthSession) return currentAuthSession;
  if (!force && currentAuthSessionPromise) return currentAuthSessionPromise;

  currentAuthSessionPromise = fetcher("/api/auth/me", { method: "GET" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      currentAuthSession = buildAuthSession(response, data);
      return currentAuthSession;
    })
    .finally(() => {
      currentAuthSessionPromise = null;
    });

  return currentAuthSessionPromise;
}

export function rememberCurrentAuthSession(user, data = {}) {
  currentAuthSessionPromise = null;
  currentAuthSession = {
    ok: Boolean(user),
    user: user || null,
    data: { ...data, user: user || null },
    csrfToken: data.csrfToken || "",
  };
  return currentAuthSession;
}

export function clearCurrentAuthSession() {
  currentAuthSession = null;
  currentAuthSessionPromise = null;
}
