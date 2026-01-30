(function authGuard() {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    window.location.href = "auth.html";
  }
})();

const app = document.getElementById("app");

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

//logout
async function logout() {
  const accessToken = localStorage.getItem("accessToken");

  try {
    const res = await fetch(`${APP_CONFIG.API_BASE}/Auths/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Logout failed: ${res.status}`);
    }

    showToast("Logged out successfully", "success");
  } catch (error) {
    console.error("Logout API error:", error);
    showToast("Logout failed, force logout", "warning");
  } finally {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("avatarUrl");
    localStorage.removeItem("fullname");

    setTimeout(() => {
      window.location.href = "/auth.html";
    }, 800);
  }
}

(async function bootstrap() {
  await loadSidebar();

  if (typeof initProfilePreview === "function") {
    await initProfilePreview();
  }
})();
