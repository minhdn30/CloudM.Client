/* =========================
   GLOBAL
   ========================= */
const app = document.getElementById("app");
let refreshPromise = null;

/* =========================
   ROUTER
   ========================= */
async function loadPage(page) {
  const res = await fetch(`pages/${page}.html`);
  app.innerHTML = await res.text();
  if (window.lucide) {
    lucide.createIcons();
  }
}

function router() {
  const path = window.location.pathname;

  switch (path) {
    case "/":
    case "/home":
      loadHome();
      break;
    case "/chat":
      loadPage("chat");
      break;
    case "/profile":
      loadPage("profile");
      break;
    default:
      loadHome();
  }
}

window.onpopstate = router;
router();

/* =========================
   LOGOUT
   ========================= */
async function logout() {
  try {
    await apiFetch("/Auths/logout", { method: "POST" });
  } catch (_) {
    // ignore
  } finally {
    clearSessionAndRedirect();
  }
}

function clearSessionAndRedirect() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("avatarUrl");
  localStorage.removeItem("fullname");

  window.location.href = "/auth.html";
}

/* =========================
   BOOTSTRAP
   ========================= */
(async function bootstrap() {
  try {
    await loadSidebar();

    if (typeof initProfilePreview === "function") {
      await initProfilePreview();
    }
  } catch (err) {
    console.error("Bootstrap failed", err);
  }
})();

/* =========================
   REFRESH TOKEN (LOCK)
   ========================= */
async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${APP_CONFIG.API_BASE}/Auths/refresh-token`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          throw new Error("REFRESH_EXPIRED");
        }
        return res.json();
      })
      .then((data) => {
        localStorage.setItem("accessToken", data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/* =========================
   API FETCH
   ========================= */
async function apiFetch(url, options = {}) {
  const accessToken = localStorage.getItem("accessToken");

  const res = await fetch(`${APP_CONFIG.API_BASE}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
    },
  });

  // OK
  if (res.status !== 401) return res;

  // Try refresh
  try {
    const newToken = await refreshAccessToken();

    return fetch(`${APP_CONFIG.API_BASE}${url}`, {
      ...options,
      credentials: "include",
      headers: {
        ...options.headers,
        Authorization: `Bearer ${newToken}`,
      },
    });
  } catch (err) {
    // ❗ CHỈ logout khi refresh-token thật sự hết hạn
    clearSessionAndRedirect();
    throw err;
  }
}
