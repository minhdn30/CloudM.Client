/* =========================
   GLOBAL
   ========================= */
const app = document.getElementById("app");
let refreshPromise = null;

// Initialize global config from local storage
if (window.APP_CONFIG) {
  APP_CONFIG.CURRENT_USER_ID = localStorage.getItem("accountId");
}

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
    await API.Auth.logout();
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

// Redundant API fetch logic removed - moved to configAPI.js
// Export refreshAccessToken globally if needed (already handled in configAPI.js)

/* =========================
   GLOBAL UPLOAD HELPERS
   These helpers provide a global full-screen upload overlay and
   an XHR FormData uploader with progress reporting. They were
   moved here so all modules can reuse them.
   ========================= */

// Create / manage global upload overlay (Instagram Style)
function createGlobalLoader() {
  if (document.getElementById("globalUploadOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "globalUploadOverlay";
  overlay.className = "global-upload-overlay";

  const card = document.createElement("div");
  card.className = "global-upload-card";

  // Instagram-style spinner (no percentage)
  const spinner = document.createElement("div");
  spinner.className = "upload-spinner";

  const label = document.createElement("div");
  label.className = "upload-text";
  label.textContent = "Uploading...";

  card.appendChild(spinner);
  card.appendChild(label);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function showGlobalLoader(percent) {
  createGlobalLoader();
  const overlay = document.getElementById("globalUploadOverlay");
  if (!overlay) return;

  // Just show the overlay - no need to update percentage
  overlay.classList.add("show");
}

function hideGlobalLoader() {
  const overlay = document.getElementById("globalUploadOverlay");
  if (overlay) overlay.classList.remove("show");
}

// uploadFormDataWithProgress has been moved to configAPI.js


