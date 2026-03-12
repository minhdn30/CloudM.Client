(function (global) {
  const state = {
    initialized: false,
    isOpen: false,
    isLoading: false,
    searchTerm: "",
    mode: "history",
    searchLimit: 20,
    historyLimit: 12,
    debounceMs: 300,
    activeRequestToken: 0,
    debounceTimer: null,
    abortController: null,
    results: [],
    historyItems: [],
    dom: {
      panel: null,
      input: null,
      clearBtn: null,
      list: null,
      closeBtn: null,
    },
  };

  function spT(key, params = {}, fallback = "") {
    return global.I18n?.t ? global.I18n.t(key, params, fallback || key) : fallback || key;
  }

  function parseIntSafe(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  }

  function normalizeId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function isAbortError(error) {
    return error?.name === "AbortError";
  }

  function applyPanelWidthVariable() {
    const width = Math.max(
      320,
      parseIntSafe(global.APP_CONFIG?.SEARCH_PANEL_WIDTH, 380),
    );
    document.documentElement.style.setProperty("--search-panel-width", `${width}px`);
  }

  function setupConfigFromApp() {
    state.searchLimit = Math.max(
      1,
      parseIntSafe(global.APP_CONFIG?.SEARCH_PANEL_SEARCH_LIMIT, 20),
    );
    state.historyLimit = Math.max(
      1,
      parseIntSafe(global.APP_CONFIG?.SEARCH_PANEL_HISTORY_LIMIT, 12),
    );
    state.debounceMs = Math.max(
      150,
      parseIntSafe(global.APP_CONFIG?.SEARCH_PANEL_SEARCH_DEBOUNCE_MS, 300),
    );
    applyPanelWidthVariable();
  }

  function buildPanelHtml() {
    return `
      <div class="search-panel-header">
        <div class="search-panel-header-row">
          <h2>${escapeHtml(spT("searchPanel.title", {}, "Search"))}</h2>
          <button
            type="button"
            class="chat-icon-btn search-panel-close-btn"
            id="search-panel-close-btn"
            aria-label="${escapeAttr(spT("searchPanel.closeTitle", {}, "Close search"))}"
            title="${escapeAttr(spT("searchPanel.closeTitle", {}, "Close search"))}"
          >
            <i data-lucide="x" size="22"></i>
          </button>
        </div>
        <div class="search-panel-input-shell">
          <i data-lucide="search" size="18"></i>
          <input
            type="text"
            id="search-panel-input"
            autocomplete="off"
            placeholder="${escapeAttr(spT("searchPanel.searchPlaceholder", {}, "Search"))}"
          />
          <button
            type="button"
            class="search-panel-clear-btn"
            id="search-panel-clear-btn"
            aria-label="${escapeAttr(spT("searchPanel.clearSearch", {}, "Clear search"))}"
            title="${escapeAttr(spT("searchPanel.clearSearch", {}, "Clear search"))}"
            hidden
          >
            <i data-lucide="x" size="16"></i>
          </button>
        </div>
      </div>
      <div class="search-panel-list" id="search-panel-list"></div>
    `;
  }

  function ensurePanel() {
    let panel = document.getElementById("search-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "search-panel";
      panel.className = "search-panel";
      panel.innerHTML = buildPanelHtml();
      document.body.appendChild(panel);
    }

    state.dom.panel = panel;
    state.dom.input = panel.querySelector("#search-panel-input");
    state.dom.clearBtn = panel.querySelector("#search-panel-clear-btn");
    state.dom.list = panel.querySelector("#search-panel-list");
    state.dom.closeBtn = panel.querySelector("#search-panel-close-btn");

    bindPanelEvents();

    if (global.lucide) {
      global.lucide.createIcons({ container: panel });
    }

    if (state.dom.input) {
      state.dom.input.value = state.searchTerm;
    }

    updateClearButton();
  }

  function bindPanelEvents() {
    if (state.dom.closeBtn && !state.dom.closeBtn.dataset.bound) {
      state.dom.closeBtn.dataset.bound = "1";
      state.dom.closeBtn.addEventListener("click", () => close());
    }

    if (state.dom.clearBtn && !state.dom.clearBtn.dataset.bound) {
      state.dom.clearBtn.dataset.bound = "1";
      state.dom.clearBtn.addEventListener("click", () => {
        updateSearchTerm("");
        if (state.dom.input) {
          state.dom.input.focus();
        }
      });
    }

    if (state.dom.input && !state.dom.input.dataset.bound) {
      state.dom.input.dataset.bound = "1";
      state.dom.input.addEventListener("input", (event) => {
        updateSearchTerm(event.target?.value ?? "");
      });
    }

    if (state.dom.list && !state.dom.list.dataset.bound) {
      state.dom.list.dataset.bound = "1";
      state.dom.list.addEventListener("click", async (event) => {
        const removeBtn = event.target.closest(".search-panel-history-remove");
        if (removeBtn && state.dom.list.contains(removeBtn)) {
          event.preventDefault();
          event.stopPropagation();
          await removeHistoryItem(removeBtn.dataset.accountId || "");
          return;
        }

        const itemEl = event.target.closest(".search-panel-item[data-account-id]");
        if (!itemEl || !state.dom.list.contains(itemEl)) {
          return;
        }

        await openAccount(itemEl.dataset.accountId || "");
      });

      state.dom.list.addEventListener("keydown", async (event) => {
        const removeBtn = event.target.closest(".search-panel-history-remove");
        if (removeBtn && state.dom.list.contains(removeBtn)) {
          return;
        }

        const itemEl = event.target.closest(".search-panel-item[data-account-id]");
        if (!itemEl || !state.dom.list.contains(itemEl)) {
          return;
        }

        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        await openAccount(itemEl.dataset.accountId || "");
      });
    }
  }

  function refreshPanelLocalization() {
    if (!state.initialized) return;

    const previousScrollTop = state.dom.list ? Number(state.dom.list.scrollTop) || 0 : 0;
    if (state.dom.panel) {
      state.dom.panel.innerHTML = buildPanelHtml();
    }
    ensurePanel();
    if (state.dom.list) {
      state.dom.list.scrollTop = previousScrollTop;
    }
    renderCurrentState();
  }

  function updateClearButton() {
    if (!state.dom.clearBtn) return;
    state.dom.clearBtn.hidden = state.searchTerm.trim().length === 0;
  }

  function normalizeItem(rawItem) {
    return {
      accountId: normalizeId(rawItem?.accountId ?? rawItem?.AccountId),
      username: (rawItem?.username ?? rawItem?.Username ?? "").toString().trim(),
      fullName: (rawItem?.fullName ?? rawItem?.FullName ?? "").toString().trim(),
      avatarUrl: (rawItem?.avatarUrl ?? rawItem?.AvatarUrl ?? "").toString().trim(),
      isFollowing:
        rawItem?.isFollowing === true ||
        rawItem?.IsFollowing === true ||
        rawItem?.isFollowing === 1 ||
        rawItem?.IsFollowing === 1,
      isFollower:
        rawItem?.isFollower === true ||
        rawItem?.IsFollower === true ||
        rawItem?.isFollower === 1 ||
        rawItem?.IsFollower === 1,
      hasDirectConversation:
        rawItem?.hasDirectConversation === true ||
        rawItem?.HasDirectConversation === true ||
        rawItem?.hasDirectConversation === 1 ||
        rawItem?.HasDirectConversation === 1,
      lastContactedAt: (rawItem?.lastContactedAt ?? rawItem?.LastContactedAt ?? "")
        .toString()
        .trim(),
      lastSearchedAt: (rawItem?.lastSearchedAt ?? rawItem?.LastSearchedAt ?? "")
        .toString()
        .trim(),
    };
  }

  function getAvatarUrl(item) {
    return (
      item.avatarUrl ||
      global.APP_CONFIG?.DEFAULT_AVATAR ||
      "assets/images/default-avatar.jpg"
    );
  }

  function getPrimaryName(item) {
    return item.username || item.fullName || spT("common.labels.user", {}, "User");
  }

  function getSecondaryName(item) {
    return (item?.fullName || "").toString().trim();
  }

  function getRelationshipLabel(item) {
    return (
      global.AccountRelationshipText?.resolveLabel?.({
        isFollowing: item?.isFollowing,
        isFollower: item?.isFollower,
        hasDirectConversation: item?.hasDirectConversation,
        lastContactedAt: item?.lastContactedAt,
      }) || ""
    );
  }

  function buildAccountPath(item) {
    const profileTarget = item.username || item.accountId;
    if (global.RouteHelper?.buildProfilePath) {
      return global.RouteHelper.buildProfilePath(profileTarget);
    }
    return profileTarget ? `/${encodeURIComponent(profileTarget)}` : "/";
  }

  function renderLoadingState() {
    if (!state.dom.list) return;

    const isHistoryMode = state.mode === "history";
    state.dom.list.innerHTML = `
      <div class="search-panel-state">
        <div class="spinner spinner-large"></div>
        <p>${escapeHtml(
          isHistoryMode
            ? spT("searchPanel.loadingHistory", {}, "Loading recent searches...")
            : spT("searchPanel.loadingResults", {}, "Searching..."),
        )}</p>
      </div>
    `;
  }

  function renderState(icon, title, description) {
    if (!state.dom.list) return;

    state.dom.list.innerHTML = `
      <div class="search-panel-state">
        <i data-lucide="${escapeAttr(icon)}"></i>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
    `;

    if (global.lucide) {
      global.lucide.createIcons({ container: state.dom.list });
    }
  }

  function renderItems(items, options = {}) {
    if (!state.dom.list) return;

    const isHistoryMode = options.historyMode === true;
    const sectionTitle = isHistoryMode
      ? spT("searchPanel.recentTitle", {}, "Recent")
      : spT("searchPanel.resultsTitle", {}, "Results");

    state.dom.list.innerHTML = `
      <div class="search-panel-section">
        <div class="search-panel-section-header">
          <span>${escapeHtml(sectionTitle)}</span>
        </div>
        <div class="search-panel-items">
          ${items
            .map((item) => {
              const primaryName = getPrimaryName(item);
              const secondaryName = getSecondaryName(item);
              const relationshipLabel = getRelationshipLabel(item);
              const avatarUrl = getAvatarUrl(item);

              return `
                <div
                  class="search-panel-item"
                  data-account-id="${escapeAttr(item.accountId)}"
                  role="button"
                  tabindex="0"
                  aria-label="${escapeAttr(primaryName)}"
                >
                  <div class="search-panel-item-main">
                    <img
                      class="search-panel-item-avatar"
                      src="${escapeAttr(avatarUrl)}"
                      alt="${escapeAttr(
                        spT("searchPanel.avatarAlt", { username: primaryName }, `Avatar of ${primaryName}`),
                      )}"
                      onerror="this.src='${escapeAttr(global.APP_CONFIG?.DEFAULT_AVATAR || "")}'"
                    />
                    <div class="search-panel-item-copy">
                      <div class="search-panel-item-name">${escapeHtml(primaryName)}</div>
                      ${
                        secondaryName
                          ? `<div class="search-panel-item-secondary">${escapeHtml(secondaryName)}</div>`
                          : ""
                      }
                      ${
                        relationshipLabel
                          ? `<div class="search-panel-item-relationship">${escapeHtml(relationshipLabel)}</div>`
                          : ""
                      }
                    </div>
                  </div>
                  ${
                    isHistoryMode
                      ? `
                        <button
                          type="button"
                          class="search-panel-history-remove"
                          data-account-id="${escapeAttr(item.accountId)}"
                          aria-label="${escapeAttr(
                            spT("searchPanel.removeRecentAria", {}, "Remove recent search"),
                          )}"
                          title="${escapeAttr(
                            spT("searchPanel.removeRecentAria", {}, "Remove recent search"),
                          )}"
                        >
                          <i data-lucide="x" size="16"></i>
                        </button>
                      `
                      : ""
                  }
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;

    if (global.lucide) {
      global.lucide.createIcons({ container: state.dom.list });
    }
  }

  function renderCurrentState() {
    if (state.isLoading) {
      renderLoadingState();
      return;
    }

    const normalizedTerm = state.searchTerm.trim();
    if (!normalizedTerm) {
      if (!state.historyItems.length) {
        renderState(
          "search",
          spT("searchPanel.emptyRecentTitle", {}, "No recent searches"),
          spT(
            "searchPanel.emptyRecentDescription",
            {},
            "Recent searches will appear here",
          ),
        );
        return;
      }

      renderItems(state.historyItems, { historyMode: true });
      return;
    }

    if (!state.results.length) {
      renderState(
        "search-x",
        spT("searchPanel.emptyResultsTitle", {}, "No results found"),
        spT(
          "searchPanel.emptyResultsDescription",
          {},
          "Try a different keyword",
        ),
      );
      return;
    }

    renderItems(state.results, { historyMode: false });
  }

  function cancelActiveSearch() {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }
  }

  async function loadHistory() {
    cancelActiveSearch();
    state.isLoading = true;
    state.mode = "history";
    renderLoadingState();

    const requestToken = ++state.activeRequestToken;
    const controller = new AbortController();
    state.abortController = controller;

    try {
      const res = await global.API?.Search?.getSearchHistory?.(state.historyLimit, {
        signal: controller.signal,
      });
      if (!res?.ok) {
        throw new Error("SEARCH_HISTORY_LOAD_FAILED");
      }

      const payload = await res.json().catch(() => []);
      if (requestToken !== state.activeRequestToken) return;

      state.historyItems = Array.isArray(payload)
        ? payload.map(normalizeItem).filter((item) => item.accountId)
        : [];
      state.isLoading = false;
      renderCurrentState();
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      console.error("Failed to load search history:", error);
      if (requestToken !== state.activeRequestToken) return;
      state.historyItems = [];
      state.isLoading = false;
      renderState(
        "alert-circle",
        spT("searchPanel.loadFailedTitle", {}, "Could not load search"),
        spT("searchPanel.loadFailedDescription", {}, "Please try again in a moment"),
      );
    } finally {
      if (state.abortController === controller) {
        state.abortController = null;
      }
    }
  }

  async function performSearch(keyword) {
    cancelActiveSearch();
    state.isLoading = true;
    state.mode = "search";
    renderLoadingState();

    const requestToken = ++state.activeRequestToken;
    const controller = new AbortController();
    state.abortController = controller;

    try {
      const res = await global.API?.Search?.searchSidebarAccounts?.(
        keyword,
        state.searchLimit,
        { signal: controller.signal },
      );
      if (!res?.ok) {
        throw new Error("SIDEBAR_SEARCH_FAILED");
      }

      const payload = await res.json().catch(() => []);
      if (requestToken !== state.activeRequestToken) return;

      state.results = Array.isArray(payload)
        ? payload.map(normalizeItem).filter((item) => item.accountId)
        : [];
      state.isLoading = false;
      renderCurrentState();
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      console.error("Failed to search sidebar accounts:", error);
      if (requestToken !== state.activeRequestToken) return;
      state.results = [];
      state.isLoading = false;
      renderState(
        "alert-circle",
        spT("searchPanel.loadFailedTitle", {}, "Could not load search"),
        spT("searchPanel.loadFailedDescription", {}, "Please try again in a moment"),
      );
    } finally {
      if (state.abortController === controller) {
        state.abortController = null;
      }
    }
  }

  function updateSearchTerm(rawValue) {
    state.searchTerm = (rawValue ?? "").toString();
    if (state.dom.input && state.dom.input.value !== state.searchTerm) {
      state.dom.input.value = state.searchTerm;
    }

    updateClearButton();
    const normalizedTerm = state.searchTerm.trim();

    if (!normalizedTerm) {
      state.results = [];
      loadHistory();
      return;
    }

    cancelActiveSearch();
    state.debounceTimer = setTimeout(() => {
      performSearch(normalizedTerm);
    }, state.debounceMs);
  }

  function upsertHistoryItem(item) {
    const normalizedAccountId = normalizeId(item?.accountId);
    if (!normalizedAccountId) return;

    const nextItem = {
      ...item,
      accountId: normalizedAccountId,
      lastSearchedAt: new Date().toISOString(),
    };

    state.historyItems = [nextItem]
      .concat(
        state.historyItems.filter((entry) => normalizeId(entry.accountId) !== normalizedAccountId),
      )
      .slice(0, state.historyLimit);
  }

  function refreshHistoryViewIfNeeded() {
    if (!state.isOpen || state.isLoading || state.searchTerm.trim()) {
      return;
    }

    renderCurrentState();
  }

  function persistHistoryItem(item) {
    const normalizedAccountId = normalizeId(item?.accountId);
    if (!normalizedAccountId) return;

    const request = global.API?.Search?.saveSearchHistory?.(normalizedAccountId);
    if (!request) return;

    Promise.resolve(request)
      .then((res) => {
        if (res && !res.ok) {
          throw new Error("SEARCH_HISTORY_SAVE_FAILED");
        }

        upsertHistoryItem(item);
        refreshHistoryViewIfNeeded();
      })
      .catch((error) => {
        console.warn("Failed to save search history:", error);
      });
  }

  async function openAccount(accountId) {
    const normalizedAccountId = normalizeId(accountId);
    if (!normalizedAccountId) return;

    const sourceItems = state.searchTerm.trim() ? state.results : state.historyItems;
    const item = sourceItems.find((entry) => normalizeId(entry.accountId) === normalizedAccountId);
    if (!item) return;

    const profilePath = buildAccountPath(item);
    if (!profilePath) return;

    persistHistoryItem(item);

    if (window.innerWidth <= 768) {
      close();
    }

    if (global.RouteHelper?.goTo) {
      global.RouteHelper.goTo(profilePath);
      return;
    }

    global.location.hash = `#${profilePath}`;
  }

  async function removeHistoryItem(accountId) {
    const normalizedAccountId = normalizeId(accountId);
    if (!normalizedAccountId) return;

    try {
      const res = await global.API?.Search?.deleteSearchHistory?.(normalizedAccountId);
      if (res && !res.ok) {
        throw new Error("SEARCH_HISTORY_DELETE_FAILED");
      }

      state.historyItems = state.historyItems.filter(
        (item) => normalizeId(item.accountId) !== normalizedAccountId,
      );
      renderCurrentState();
    } catch (error) {
      console.error("Failed to delete search history:", error);
      if (global.toastError) {
        global.toastError(
          spT("searchPanel.removeRecentFailed", {}, "Could not remove this recent search"),
        );
      }
    }
  }

  function focusInput() {
    if (!state.dom.input) return;

    requestAnimationFrame(() => {
      state.dom.input?.focus();
      state.dom.input?.setSelectionRange?.(
        state.dom.input.value.length,
        state.dom.input.value.length,
      );
    });
  }

  function open() {
    init();
    if (state.isOpen) {
      focusInput();
      return;
    }

    if (typeof global.closeNotificationsPanel === "function") {
      global.closeNotificationsPanel();
    }

    if (typeof global.closeChatSidebar === "function") {
      global.closeChatSidebar(true);
    }

    state.dom.panel?.classList.add("show");
    document.body.classList.add("search-panel-open");
    state.isOpen = true;

    if (typeof global.setActiveSidebar === "function") {
      global.setActiveSidebar();
    }

    if (state.searchTerm.trim()) {
      renderCurrentState();
      if (!state.results.length && !state.isLoading) {
        performSearch(state.searchTerm.trim());
      }
    } else {
      loadHistory();
    }

    focusInput();
  }

  function close() {
    if (!state.isOpen) return;

    cancelActiveSearch();
    state.dom.panel?.classList.remove("show");
    document.body.classList.remove("search-panel-open");
    state.isOpen = false;
    state.isLoading = false;
    state.searchTerm = "";
    state.results = [];

    if (state.dom.input) {
      state.dom.input.value = "";
    }

    updateClearButton();

    if (typeof global.setActiveSidebar === "function") {
      global.setActiveSidebar();
    }
  }

  function toggle() {
    if (state.isOpen) {
      close();
      return;
    }

    open();
  }

  function init() {
    if (state.initialized) return;
    setupConfigFromApp();
    ensurePanel();
    state.initialized = true;
  }

  if (global.I18n?.onChange) {
    global.I18n.onChange(() => {
      applyPanelWidthVariable();
      refreshPanelLocalization();
    });
  }

  global.SearchPanel = {
    init,
    open,
    close,
    toggle,
    get isOpen() {
      return state.isOpen;
    },
  };

  global.toggleSearchPanel = () => global.SearchPanel.toggle();
  global.closeSearchPanel = () => global.SearchPanel.close();

  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
})(window);
