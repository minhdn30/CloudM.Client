async function loadSidebar() {
  const res = await fetch("pages/sidebar.html");
  document.getElementById("sidebar").innerHTML = await res.text();
  lucide.createIcons();

  const avatarUrl = localStorage.getItem("avatarUrl");
  const fullname = localStorage.getItem("fullname");

  const avatarElement = document.getElementById("sidebar-avatar");
  const nameElement = document.getElementById("sidebar-name");

  const defaultAvatar = "assets/images/default-avatar.jpg";

  if (!avatarUrl || avatarUrl === "null" || avatarUrl.trim() === "") {
    avatarElement.src = defaultAvatar;
  } else {
    avatarElement.src = avatarUrl;
  }

  nameElement.textContent =
    fullname && fullname.trim() !== "" ? fullname : "User";

  // Load theme preference
  loadThemePreference();
}

function toggleMoreMenu(e) {
  e.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");

  // Close settings if open
  settingsDropdown.classList.remove("show");

  // Toggle more menu
  const isOpening = !moreDropdown.classList.contains("show");

  if (isOpening) {
    // Reset animation by removing and re-adding the class
    moreDropdown.classList.remove("show");
    void moreDropdown.offsetWidth; // Force reflow to restart animation
    moreDropdown.classList.add("show");
    sidebar.classList.add("expanded");
  } else {
    moreDropdown.classList.remove("show");
    sidebar.classList.remove("expanded");
  }
}

function toggleSettingsMenu(e) {
  e.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");

  // Hide more menu and show settings
  moreDropdown.classList.remove("show");

  // Reset animation by removing and re-adding the class
  settingsDropdown.classList.remove("show");
  void settingsDropdown.offsetWidth; // Force reflow to restart animation
  settingsDropdown.classList.add("show");

  // Keep sidebar expanded
  sidebar.classList.add("expanded");

  // Recreate icons for the settings menu
  lucide.createIcons();
}

function backToMoreMenu(e) {
  e.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");

  // Hide settings and show more menu
  settingsDropdown.classList.remove("show");

  // Reset animation by removing and re-adding the class
  moreDropdown.classList.remove("show");
  void moreDropdown.offsetWidth; // Force reflow to restart animation
  moreDropdown.classList.add("show");

  // Keep sidebar expanded
  sidebar.classList.add("expanded");
}

document.addEventListener("click", () => {
  const sidebar = document.querySelector(".sidebar");
  document.getElementById("moreDropdown")?.classList.remove("show");
  document.getElementById("settingsDropdown")?.classList.remove("show");
  sidebar?.classList.remove("expanded");
});

function setActiveSidebar(route) {
  document
    .querySelectorAll(".sidebar .menu-item[data-route]")
    .forEach((item) => {
      item.classList.toggle("active", item.dataset.route === route);
    });
}

function navigate(e, route) {
  e.preventDefault();

  // Set active sidebar
  setActiveSidebar(route);

  // Close dropdowns and collapse sidebar
  const sidebar = document.querySelector(".sidebar");
  document.getElementById("moreDropdown")?.classList.remove("show");
  document.getElementById("settingsDropdown")?.classList.remove("show");
  sidebar?.classList.remove("expanded");

  // TODO: logic SPA của bạn
  // loadPage(route);
  // history.pushState({}, "", route);
}

// Theme toggle functionality
function toggleTheme(e) {
  e.stopPropagation();
  const body = document.body;
  const themeIcon = document.getElementById("theme-icon");
  const themeToggle = document.getElementById("theme-toggle");

  // Toggle theme
  body.classList.toggle("light-mode");
  themeToggle.classList.toggle("active");

  // Update icon
  if (body.classList.contains("light-mode")) {
    themeIcon.setAttribute("data-lucide", "sun");
    localStorage.setItem("theme", "light");
  } else {
    themeIcon.setAttribute("data-lucide", "moon");
    localStorage.setItem("theme", "dark");
  }

  // Recreate icons
  lucide.createIcons();
}

function loadThemePreference() {
  const theme = localStorage.getItem("theme");
  const body = document.body;
  const themeIcon = document.getElementById("theme-icon");
  const themeToggle = document.getElementById("theme-toggle");

  if (theme === "light") {
    body.classList.add("light-mode");
    themeToggle.classList.add("active");
    themeIcon.setAttribute("data-lucide", "sun");
  } else {
    themeIcon.setAttribute("data-lucide", "moon");
  }

  lucide.createIcons();
}

// Settings menu functions (placeholder)
function openLanguageMenu(e) {
  e.stopPropagation();
  console.log("Open language menu");
  // TODO: Implement language selection
}

function openNotificationSettings(e) {
  e.stopPropagation();
  console.log("Open notification settings");
  // TODO: Implement notification settings
}

function openPrivacySettings(e) {
  e.stopPropagation();
  console.log("Open privacy settings");
  // TODO: Implement privacy settings
}

function openAccountSettings(e) {
  e.stopPropagation();
  console.log("Open account settings");
  // TODO: Implement account settings
}

function openHelp(e) {
  e.stopPropagation();
  console.log("Open help");
  // TODO: Implement help & support
}

function openAbout(e) {
  e.stopPropagation();
  console.log("Open about");
  // TODO: Implement about page
}

function logout() {
  console.log("Logging out...");
  // TODO: Implement logout logic
}
